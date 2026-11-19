import { makeVaultDoor } from './vault-door'
import {
  makeEntity, makeMaterial, makePrefab, makeProject, makeScene,
  type Component, type Scene, type Vec3, type UIElement,
} from '../packages/project-schema/src'

/** Two rooms built from the same editable components and controls as a blank project. */
export function createKeyVault() {
  const project = makeProject('Key Vault')
  project.id = 'key-vault'
  const hall = project.scenes[0]
  hall.id = project.activeScene = 'entry'
  hall.name = 'The Lantern Passage'
  const vault = makeScene('The Treasury')
  vault.id = 'treasury'
  project.scenes.push(vault)
  project.settings = {
    ...project.settings, bounds: [-3.5, 3.5, -5, 5],
    variables: { keys: 0, seals: 2, lanterns: 0, room: 'Passage' },
  }
  const palette: Record<string, string> = {
    basalt: '#343e57', slate: '#50647b', path: '#a4a7ad', ink: '#272f45',
    brass: '#f2ba54', amber: '#ffda72', jade: '#36baac', blue: '#355d88',
  }
  project.assets.push(...Object.entries(palette).map(([name,color]) => makeMaterial(name,color,name)))
  function node(scene:Scene,id:string,name:string,pos:Vec3,shape?:string,material='basalt',scale:Vec3=[1,1,1],parent:string|null=null) {
    const e=makeEntity(name,shape)
    Object.assign(e,{id,parent})
    e.transform.position=pos
    e.transform.scale=scale
    if(shape) e.components[0].material=material
    scene.entities.push(e)
    return e
  }
  const box=(scene:Scene,id:string,p:Vec3,s:Vec3,m:string,parent?:string)=>node(scene,id,id.replaceAll('-',' '),p,'box',m,s,parent)
  function room(scene:Scene,accent:string) {
    const prefix=scene.id+'-'
    scene.environment={background:'#202a40',ambient:1.25,shadows:true}
    box(scene,prefix+'foundation',[0,-.5,0],[8.4,.85,12], 'basalt')
    box(scene,prefix+'floor',[0,-.1,0],[8,.18,11.6], 'slate').properties.floor=true
    for(let i=0;i<9;i++){
      box(scene,prefix+'paver-'+i,[0,.012,4.6-i*1.15],[1.65,.04,.99], i%3===0?'path':'basalt')
    }
    for(const side of [-1,1]){
      box(scene,prefix+'parapet-'+side,[side*3.88,.22,0],[.24,.5,11.65], 'basalt')
      for(const z of [-4,0,4]){
        const id=prefix+'column-'+side+'-'+z
        node(scene,id,'Watch column',[side*3.52,.6,z],'cylinder','ink',[.76,1.2,.76])
        box(scene,id+'-band',[side*3.52,1.23,z],[.66,.12,.66], 'brass')
        node(scene,id+'-lamp','Beacon',[side*3.52,1.52,z],'icosahedron',accent,[.43,.64,.43])
      }
    }
    node(scene,prefix+'camera','Gallery camera',[8.6,11.5,13.5]).components.push({
      type:'camera',projection:'orthographic',target:[0,0,0],size:13,zoom:1,
    })
    node(scene,prefix+'sun','Sun lamp',[-3,11,5]).components.push({type:'light',kind:'directional',color:'#fff3d4',intensity:2.1})
    node(scene,prefix+'ambient','Ambient lamp',[0,0,0]).components.push({type:'light',kind:'ambient',color:'#cfe5ff',intensity:1.3})
    const adventurer=node(scene,prefix+'player','Explorer',[0,0,4.2])
    adventurer.components.push({type:'behavior',kind:'player',params:{speed:3.4}})
    box(scene,prefix+'coat',[0,.38,0],[.5,.48,.37],'blue',adventurer.id)
    box(scene,prefix+'head',[0,.81,0],[.4,.38,.37],'brass',adventurer.id)
    box(scene,prefix+'hood',[0,1,0],[.51,.18,.47],'jade',adventurer.id)
    for(const x of [-.15,.15]) box(scene,prefix+'boot-'+x,[x,.11,.03],[.2,.22,.26],'ink',adventurer.id)
  }
  room(hall,'amber')
  room(vault,'jade')
  const gate=node(hall,'vault-gate','Vault gate',[0,0,-3.7])
  const model=makeVaultDoor()
  project.assets.push(model)
  gate.components.push(
    {type:'mesh',shape:'model',asset:model.id},
    {type:'animation',clip:'Open',autoplay:false,loop:false,speed:1},
  )
  const relic=node(vault,'relic','Treasury crystal',[0,1.2,-1.5],'icosahedron','jade',[1,1.7,1])
  relic.components.push({type:'behavior',kind:'rotate',params:{axis:'y',speed:.75}})
  node(vault,'dais','Treasury dais',[0,.32,-1.5],'cylinder','brass',[2.2,.64,2.2])

  const library=makeScene('Key prototype')
  const key=node(library,'sun-key','Sun Key',[0,.55,0])
  node(library,'bow','Cut amber',[0,.22,0],'icosahedron','amber',[.45,.48,.24],key.id)
  box(library,'shaft',[0,-.13,0],[.12,.52,.13],'brass',key.id)
  box(library,'teeth',[.1,-.32,0],[.28,.11,.13],'brass',key.id)
  key.components.push({type:'behavior',kind:'rotate',params:{axis:'y',speed:1.4}})
  key.properties.tags=['brass-key']
  key.components.push({type:'behavior',kind:'collectible',params:{points:1,radius:.6}})
  const prefab=makePrefab(library,key.id)
  prefab.id='sun-key-prefab'
  project.assets.unshift(prefab)

  const barrier=node(hall,'door-collider','Gate collider',[0,.95,-3.7])
  barrier.components.push({type:'collider',shape:'box',size:[3,2,.32]})
  const exit=node(hall,'treasury-exit','Treasury threshold',[0,0,-4.6])
  exit.active=false
  exit.components.push({type:'collider',shape:'box',trigger:true,size:[2.85,1.8,.7]})
  const openInventory:Component={type:'rule',event:'input.Interact',actions:[{kind:'openScreen',target:'satchel'}]}
  const rules=node(hall,'passage-rules','Passage rules',[0,0,0])
  const shopRules=node(vault,'treasury-rules','Treasury rules',[0,0,0])
  const spawnActions=[2.7,.45,-1.85].map((z,i)=>{
    const anchor=node(hall,'key-marker-'+i,'Key marker '+(i+1),[0,.65,z])
    return {kind:'spawnPrefab',target:prefab.id,at:anchor.id}
  })
  const shopRule:Component={
    type:'rule',event:'market.buy',condition:{key:'seals',op:'>=',value:1},
    actions:[{kind:'addVariable',key:'seals',value:-1},{kind:'addVariable',key:'lanterns',value:1}],
  }
  rules.components.push(
    {type:'rule',event:'scene.start',actions:spawnActions},
    {type:'rule',event:'coin.collected',tag:'brass-key',actions:[{kind:'addVariable',key:'keys',value:1}]},
    {type:'rule',event:'coin.collected',tag:'brass-key',condition:{key:'keys',op:'==',value:3},
      actions:[{kind:'playAnimation',target:gate.id,clip:'Open'}]},
    {type:'rule',event:'animation.finished',source:gate.id,actions:[
      {kind:'setActive',target:barrier.id,active:false},
      {kind:'setActive',target:exit.id,active:true},
    ]},
    {type:'rule',event:'trigger.enter',source:exit.id,actions:[{kind:'loadScene',target:vault.id}]},
    openInventory,shopRule,
  )
  shopRules.components.push(structuredClone(openInventory),structuredClone(shopRule),{type:'rule',event:'scene.start',
    actions:[{kind:'setVariable',key:'room',value:'Treasury'}]})

  project.screens=[
    {id:'satchel',name:'Inventory',phase:'window',safeArea:true,background:'#172137f5'},
    {id:'market',name:'Lantern shop',phase:'window',safeArea:true,background:'#243843fa'},
  ]
  const control=(id:string,type:string,text:string,x:number,y:number,extra:Partial<UIElement>={}):UIElement=>({
    id,type,text,x,y,anchor:'center',...extra,
  })
  project.ui=[
    control('key-count','counter','vault.keys',3,4,{variable:'keys',anchor:'top-left',fontSize:20}),
    control('vault-inventory','button','vault.inventory',3,12,{action:'input',target:'Interact',anchor:'top-left'}),
    control('room-label','counter','vault.room',3,4,{variable:'room',anchor:'bottom-left'}),
    control('inventory-title','text','vault.inventory',0,-26,{screen:'satchel',fontSize:30}),
    control('inventory-keys','counter','vault.keys',0,-12,{screen:'satchel',variable:'keys'}),
    control('inventory-lamps','counter','vault.lanterns',0,-4,{screen:'satchel',variable:'lanterns'}),
    control('inventory-shop','button','vault.shop',0,8,{screen:'satchel',action:'open',target:'market'}),
    control('inventory-back','button','vault.back',0,22,{screen:'satchel',action:'back'}),
    control('market-title','text','vault.shop',0,-26,{screen:'market',fontSize:30}),
    control('purse','counter','vault.seals',0,-12,{screen:'market',variable:'seals'}),
    control('goods','counter','vault.lanterns',0,-4,{screen:'market',variable:'lanterns'}),
    control('buy-lantern','button','vault.buy',0,9,{screen:'market',action:'event',event:'market.buy'}),
    control('market-back','button','vault.back',0,23,{screen:'market',action:'back'}),
  ]
  project.locales={
    en:{'vault.inventory':'Inventory','vault.shop':'Lantern shop','vault.keys':'Keys','vault.room':'Room','vault.lanterns':'Lanterns','vault.seals':'Seals','vault.back':'Back','vault.buy':'Buy lantern · 1 seal'},
    ru:{'vault.inventory':'Инвентарь','vault.shop':'Лавка фонарей','vault.keys':'Ключи','vault.room':'Зал','vault.lanterns':'Фонари','vault.seals':'Печати','vault.back':'Назад','vault.buy':'Купить фонарь · 1 печать'},
  }
  return project
}
