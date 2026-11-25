import type { AssetType, Entity, Project } from './index'

export interface ProjectIssue {
  owner: string
  message: string
  sceneId?: string
  entityId?: string
  assetId?: string
  uiId?: string
}

// Keep incomplete projects editable and saveable. Resolve links when preparing a playable build.
export function projectIssues(project: Project): ProjectIssue[] {
  const issues: ProjectIssue[] = []
  const assets = new Map(project.assets.map(a => [a.id, a]))
  const scenes = new Set(project.scenes.map(s => s.id))
  const windows = new Set(project.screens?.filter(s => s.phase === 'window').map(s => s.id))
  const ui = new Set(project.ui.map(item => item.id))
  type Owner = Omit<ProjectIssue, 'message'>
  function missing(owner: Owner, label: string, value: unknown) {
    issues.push({...owner, message: value ? label + ' “' + value + '” is missing or has the wrong type.' : 'Choose '+label+'.'})
  }
  function asset(owner: Owner, label: string, value: unknown, type?: AssetType, required = false) {
    if (!value && !required) return
    const found = typeof value === 'string' && assets.get(value)
    if (!found || (type && found.type !== type)) missing(owner,label,value)
  }
  function link(owner:Owner,label:string,value:unknown,ids:Set<string>,required=false){
    if ((value || required) && !(typeof value==='string' && ids.has(value))) missing(owner,label,value)
  }
  function checkEntities(nodes:Entity[], location:Owner, ids:Set<string>){
    for (const entity of nodes) {
      const owner = {...location, owner:location.owner+' / '+entity.name, entityId:location.assetId ? undefined : entity.id}
      for (const c of entity.components) {
        if(c.enabled===false)continue
        if(c.type==='mesh'){
          asset(owner,'material',c.material,'material')
          if(c.shape==='model')asset(owner,'model',c.asset,'model',true)
        }
        if(c.type==='decal'){asset(owner,'decal material',c.material,'material');asset(owner,'decal texture override',c.texture,'texture')}
        if(c.type==='script'){
          asset(owner,'script',c.asset,'script',true)
          for(const [key,type] of Object.entries(c.paramTypes??{})){
            if(type==='entity')link(owner,key,c.params?.[key],ids)
            if(type==='asset')asset(owner,key,c.params?.[key])
          }
        }
        if(c.type==='terrain'){asset(owner,'base material',c.baseMaterial,'material');asset(owner,'paint material',c.paintMaterial,'material')}
        if(c.type==='audio')asset(owner,'audio clip',c.asset,'audio')
        if(c.type==='sprite')asset(owner,'sprite texture',c.texture,'texture')
        if(c.type==='behavior'){
          const p=c.params??{}
          if(c.kind==='changeScene')link(owner,'destination scene',p.scene,scenes,true)
          if(['follow','lookAt'].includes(c.kind))link(owner,'target entity',p.target,ids,true)
          if(c.kind==='toggleUI')link(owner,'UI element',p.target,ui,true)
          if(c.kind==='sound')asset(owner,'audio clip',p.asset,'audio')
          if(c.kind==='spawn'){
            if(p.prefab)asset(owner,'spawn prefab',p.prefab,'prefab',true)
            else link(owner,'spawn source',p.target,ids,true)
          }
        }
        if(c.type==='rule'){
          if(c.source && !ui.has(c.source))link(owner,'event source',c.source,ids)
          for(const action of c.actions??[]){
            if(['setActive','playAnimation'].includes(action.kind))link(owner,'target entity',action.target,ids)
            if(action.kind==='openScreen'||action.kind==='closeScreen')link(owner,'target window',action.target,windows,true)
            if(action.kind==='loadScene')link(owner,'destination scene',action.target,scenes,true)
            if(action.kind==='spawnPrefab'){asset(owner,'spawn prefab',action.target,'prefab',true);link(owner,'spawn anchor',action.at,ids)}
            if(action.kind==='playSound')asset(owner,'audio clip',action.target,'audio')
          }
        }
      }
    }
  }
  const allEntities = new Set<string>()
  for (const scene of project.scenes) {
    const ids = new Set(scene.entities.map(e=>e.id))
    ids.forEach(id=>allEntities.add(id))
    checkEntities(scene.entities,{owner:scene.name,sceneId:scene.id},ids)
  }
  for (const a of project.assets) {
    const owner={owner:a.name,assetId:a.id}
    if(a.type==='material'){
      for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])asset(owner,key,a.properties[key],'texture')
      asset(owner,'shader',a.properties.shader,'shader')
    }
    if(a.type==='prefab'){
      const nodes=JSON.parse(a.data) as Entity[]
      checkEntities(nodes,owner,new Set([...allEntities,...nodes.map(e=>e.id)]))
    }
  }
  for(const el of project.ui){
    const owner={owner:'UI / '+(el.text||el.id),uiId:el.id}
    if(el.action==='open')link(owner,'target window',el.target,windows,true)
    if(el.type==='image')asset(owner,'image',el.asset,'texture')
  }
  return issues
}
