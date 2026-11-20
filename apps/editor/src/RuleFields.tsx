import { useId } from 'react'
import { Field, Numeric } from './Fields'
import { SceneEntityPickerButton } from './SceneEntityPicker'
import { getScene, type Component, type Project } from '../../../packages/project-schema/src'
import { actionNames, newAction, operators, type Action, type Condition, type Value } from '../../../packages/behaviors/src/rules'

type Choice = {id:string; name:string}
function Reference({label,items,value,placeholder,onChange,project,pickEntity}:{
  label:string;items:Choice[];value?:string;placeholder?:string;onChange:(id:string)=>void;project?:Project;pickEntity?:boolean
}) {
  return <Field label={label}><div style={{display:'flex',gap:4,width:'100%'}}><select style={{flex:1,minWidth:0}} value={value || ''} onChange={e=>onChange(e.target.value)}>
    <option value="">{placeholder || 'Select…'}</option>
    {items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    {value && !items.some(item=>item.id===value) && <option value={value}>{value} (missing)</option>}
  </select>{pickEntity && project && <SceneEntityPickerButton project={project} value={value} onPick={onChange} />}</div></Field>
}
function Scalar({value,change}: {value:Value;change:(v:Value)=>void}) {
  return <><Field label="Value type"><select value={typeof value} onChange={e=>change(
    e.target.value==='number'?0:e.target.value==='boolean'?true:''
  )}><option value="number">Number</option><option value="string">Text</option><option value="boolean">Boolean</option></select></Field>
  <Field label="Value">{typeof value==='number'?<Numeric label="Value" value={value} change={change}/>
    :typeof value==='boolean'?<select value={String(value)} onChange={e=>change(e.target.value==='true')}><option>true</option><option>false</option></select>
    :<input value={value} onChange={e=>change(e.target.value)}/>}</Field></>
}
export function RuleFields({project,rule,change}:{project:Project;rule:Component;change:(patch:Partial<Component>)=>void}) {
  const entities=getScene(project).entities
  const screens=(project.screens || []).filter(s=>s.phase==='window')
  const cond = rule.condition as Condition | undefined
  const actions:Action[] = rule.actions || []
  const patchCond=(fields:Partial<Condition>)=>change({condition:{...cond,...fields}})
  const patchAction=(i:number,value:Action)=>change({actions:actions.map((a,n)=>n===i?value:a)})
  function move(i:number,to:number) {
    const next=actions.slice()
    const [action]=next.splice(i,1)
    next.splice(to,0,action)
    change({actions:next})
  }
  const variables=Array.from(new Set(['score','time','health',...Object.keys(project.settings.variables||{})]))
  const list=useId()
  return <div className="rule-fields">
    <Field label="On event"><input list="mf-event-catalog" value={rule.event || ''} onChange={e=>change({event:e.target.value})}/></Field>
    <Reference label="Source" project={project} pickEntity value={rule.source} items={[...entities,...project.ui.map(item=>({id:item.id,name:item.text||item.id}))]} placeholder="Any source" onChange={source=>change({source})}/>
    <Field label="Source tag"><input value={rule.tag || ''} placeholder="Any tag" onChange={e=>change({tag:e.target.value})}/></Field>
    <Field label="Condition"><input type="checkbox" checked={!!cond} onChange={e=>change({condition:e.target.checked?{key:'score',op:'>=',value:1}:undefined})}/></Field>
    {cond && <fieldset><legend>When</legend>
      <Field label="Variable"><input list={list} value={cond.key} onChange={e=>patchCond({key:e.target.value})}/></Field>
      <Field label="Operator"><select value={cond.op} onChange={e=>patchCond({op:e.target.value as Condition['op']})}>{operators.map(op=><option key={op}>{op}</option>)}</select></Field>
      <Scalar value={cond.value} change={value=>patchCond({value})}/>
    </fieldset>}
    {actions.map((a,i)=>{
      const patch=(p:Partial<Action>)=>patchAction(i,{...a,...p})
      const choices=a.kind==='loadScene'?project.scenes:
        a.kind==='openScreen'||a.kind==='closeScreen'?screens:
        a.kind==='spawnPrefab'?project.assets.filter(x=>x.type==='prefab'):
        a.kind==='playSound'?project.assets.filter(x=>x.type==='audio'):entities
      const variable=a.kind==='setVariable'||a.kind==='addVariable'
      return <fieldset key={i}><legend>Action {i+1}</legend>
        <Field label="Do"><select value={a.kind} onChange={e=>patchAction(i,newAction(e.target.value as Action['kind']))}>{Object.entries(actionNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
        {variable ? <><Field label="Variable"><input list={list} value={a.key||''} onChange={e=>patch({key:e.target.value})}/></Field>
          {a.kind==='addVariable'?<Field label="Amount"><Numeric label="Amount" value={Number(a.value)||0} change={value=>patch({value})}/></Field>:<Scalar value={a.value??0} change={value=>patch({value})}/>}</>
          :a.kind==='emit'?<Field label="Publish event"><input list="mf-event-catalog" value={a.event||''} onChange={e=>patch({event:e.target.value})}/></Field>
          :<Reference label="Target" project={project} pickEntity={choices === entities} items={choices} value={a.target} placeholder={['setActive','playAnimation'].includes(a.kind)?'This entity':undefined} onChange={target=>patch({target})}/>}
        {a.kind==='setActive'&&<Field label="Active"><input type="checkbox" checked={a.active!==false} onChange={e=>patch({active:e.target.checked})}/></Field>}
        {a.kind==='spawnPrefab'&&<Reference label="Spawn at" project={project} pickEntity items={entities} placeholder="This entity" value={a.at} onChange={at=>patch({at})}/>}
        {a.kind==='playAnimation'&&<Field label="Clip"><input value={a.clip||''} placeholder="First clip" onChange={e=>patch({clip:e.target.value})}/></Field>}
        <div className="rule-order"><button aria-label={'Move action '+(i+1)+' up'} disabled={!i} onClick={()=>move(i,i-1)}>↑</button>
        <button aria-label={'Move action '+(i+1)+' down'} disabled={i===actions.length-1} onClick={()=>move(i,i+1)}>↓</button>
        <button onClick={()=>change({actions:actions.filter((_,n)=>i!==n)})}>Remove action</button></div>
      </fieldset>
    })}
    <button className="mf-secondary" onClick={()=>change({actions:[...actions,newAction('setVariable')]})}>Add action</button>
    <datalist id={list}>{variables.map(key=><option key={key} value={key}/>)}</datalist>
  </div>
}
