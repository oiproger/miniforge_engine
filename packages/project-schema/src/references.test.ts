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
