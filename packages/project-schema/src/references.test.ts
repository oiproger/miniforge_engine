import {expect,it} from 'vitest'
import {getScene,makeProject,makeEntity,makePrefab} from './index'
import {projectIssues} from './references'

it('locates dangling links in the scene, asset library and HUD',()=>{
 const p=makeProject(),s=getScene(p),e=makeEntity('Door','box')
 e.components.push({type:'script',asset:'missing'},{type:'behavior',kind:'changeScene',params:{scene:'lost'}})
 s.entities.push(e)
 p.ui.push({id:'button',type:'button',text:'Shop',x:0,y:0,action:'open',target:'lost'})
 p.assets.push(makePrefab(s,e.id))
 const issues=projectIssues(p)
 expect(issues.filter(i=>i.entityId===e.id)).toHaveLength(2)
 expect(issues.filter(i=>i.assetId)).toHaveLength(2)
 expect(issues.find(i=>i.uiId==='button')?.message).toContain('window')
})

it('validates decal material and optional texture override references', () => {
 const p = makeProject()
 const e = makeEntity('Stain')
 e.components = [{ type: 'decal', material: 'missing-material', texture: 'missing-texture', projection: 'surface' }]
 p.scenes[0].entities.push(e)
 const issues = projectIssues(p).filter(i => i.entityId === e.id)
 expect(issues).toHaveLength(2)
 expect(issues.some(i => i.message.includes('decal material'))).toBe(true)
 expect(issues.some(i => i.message.includes('decal texture override'))).toBe(true)
 p.assets.push({ id: 'missing-material', type: 'material', name: 'Mud', data: '', properties: { color: '#554433' } })
 p.assets.push({ id: 'missing-texture', type: 'texture', name: 'Mud alpha', data: 'data:image/png;base64,AA==', properties: {} })
 expect(projectIssues(p).filter(i => i.entityId === e.id)).toEqual([])
})
