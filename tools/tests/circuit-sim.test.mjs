// Unit tests for Assets/Scripts/CircuitSim.ts (pure logic). Run:  node tools/tests/circuit-sim.test.mjs   (Node 22.6+ strips the types)
import {Circuit, evaluateFunctions} from '../../Assets/Scripts/CircuitSim.ts'

let fails = 0
const check = (cond, msg) => {
  if (!cond) {
    fails++
    console.log('FAIL', msg)
  } else console.log('ok  ', msg)
}

const parts = [
  {id: 'batt', spec: {kind: 'battery', p: {volts: 6}}},
  {id: 'boost', spec: {kind: 'boost', p: {vout: 5}}},
  {id: 'esp', spec: {kind: 'mcu', gpios: ['IO12', 'IO13', 'IO14', 'IO15', 'IO2', 'IO4']}},
  {id: 'drv', spec: {kind: 'l293d'}},
  {id: 'sr', spec: {kind: 'hc595'}},
  {id: 'mot', spec: {kind: 'motor'}},
  {id: 'srv', spec: {kind: 'servo'}},
]
for (let i = 1; i <= 4; i++) {
  parts.push({id: 'r' + i, spec: {kind: 'resistor', p: {ohms: 220}}})
  parts.push({id: 'led' + i, spec: {kind: 'led'}})
}
const circuit = new Circuit(parts)
const fns = [
  {id: 'drive', label: 'Drive', icon: 'directions_car', goals: [{part: 'mot', effect: 'spin+'}, {part: 'mot', effect: 'spin-'}]},
  {id: 'steer', label: 'Steer', icon: 'swap_horiz', goals: [{part: 'srv', effect: 'moves'}]},
  {id: 'lights', label: 'Lights', icon: 'lightbulb', goals: [1, 2, 3, 4].map((n) => ({part: 'led' + n, effect: 'lit'}))},
]

const power = [
  ['batt/+', 'boost/IN+'], ['batt/-', 'boost/IN-'],
  ['boost/OUT+', 'esp/5V'], ['boost/OUT-', 'esp/GND'],
  ['boost/OUT+', 'drv/16'], ['boost/OUT+', 'drv/8'], ['boost/OUT-', 'drv/4'], ['boost/OUT+', 'drv/1'],
  ['esp/3V3', 'sr/16'], ['boost/OUT-', 'sr/8'], ['esp/3V3', 'sr/10'], ['boost/OUT-', 'sr/13'],
  ['boost/OUT+', 'srv/VCC'], ['boost/OUT-', 'srv/GND'],
]
const drive = [['esp/IO12', 'drv/2'], ['esp/IO13', 'drv/7'], ['drv/3', 'mot/M+'], ['drv/6', 'mot/M-']]
const steer = [['esp/IO15', 'srv/SIG']]
const lights = [['esp/IO14', 'sr/14'], ['esp/IO2', 'sr/11'], ['esp/IO4', 'sr/12']]
const qpins = ['15', '1', '2', '3']
for (let i = 0; i < 4; i++) {
  lights.push(['sr/' + qpins[i], 'r' + (i + 1) + '/1'])
  lights.push(['r' + (i + 1) + '/2', 'led' + (i + 1) + '/A'])
  lights.push(['led' + (i + 1) + '/K', 'boost/OUT-'])
}
const full = [...power, ...drive, ...steer, ...lights]

function run(name, wires) {
  const t = Date.now()
  const r = evaluateFunctions(circuit, wires, fns)
  console.log('--', name, '(' + r.exploration.solves + ' solves, ' + (Date.now() - t) + ' ms)', r.reports.map((x) => x.id + ':' + (x.pass ? 'PASS' : 'fail ' + x.done + '/' + x.total + ' [' + x.missing.join('; ') + ']')).join(' | '), r.exploration.hazards.length ? 'HAZARDS: ' + r.exploration.hazards.join('; ') : '')
  return r
}

// 1. reference wiring: everything works
let r = run('reference wiring', full)
check(r.reports.every((x) => x.pass), 'reference wiring passes drive, steer and lights')
check(r.exploration.hazards.length === 0, 'reference wiring has no hazards: ' + r.exploration.hazards.join('; '))

// 2. nothing wired: all fail
r = run('no wires', [])
check(r.reports.every((x) => !x.pass), 'no wires: nothing works')

// 3. power only: nothing moves
r = run('power only', power)
check(r.reports.every((x) => !x.pass), 'power only: functions still fail')

// 4. power + drive: drive passes only
r = run('power + drive', [...power, ...drive])
check(r.reports[0].pass && !r.reports[1].pass && !r.reports[2].pass, 'power + drive: only Drive passes')

// 5. battery wired backwards into the boost converter: nothing powers up
const rev = full.map((w) => w.map((p) => (p === 'batt/+' ? 'batt/-' : p === 'batt/-' ? 'batt/+' : p)))
r = run('battery reversed', rev)
check(r.reports.every((x) => !x.pass), 'reversed battery: boost converter stays off (nothing works)')

// 6. motor on one output only (other side floating): no spin
r = run('motor half wired', full.filter((w) => w.join() !== 'drv/6,mot/M-'))
check(!r.reports[0].pass, 'motor missing one wire: Drive fails')

// 7. LED without its resistor: hazard
r = run('LED 1 without resistor', full.filter((w) => w.join() !== 'r1/2,led1/A' && w.join() !== 'sr/15,r1/1').concat([['sr/15', 'led1/A']]))
check(!r.exploration.hazards.some((h) => h.indexOf('led1') === 0), 'LED straight on a 595 output: its ~50 ohm output limits the current (no hazard)')

// 8. LED on the boost rail with no resistor: hazard
r = run('LED across 5V rail', [...power, ['boost/OUT+', 'led1/A'], ['led1/K', 'boost/OUT-']])
check(r.exploration.hazards.some((h) => h.indexOf('led1') === 0 && h.indexOf('overcurrent') > 0), 'LED straight across 5 V: overcurrent hazard')

// 9. direct short across the battery
r = run('battery short', [['batt/+', 'batt/-']])
check(r.exploration.hazards.some((h) => h.indexOf('short') > 0), 'battery shorted: hazard reported')

// 10. shift register powered from 5 V: ESP32 3.3 V logic is below 0.7 x Vcc -> not reliable (the 595 control is not recognised)
const sr5 = full.map((w) => w.map((p) => (p === 'esp/3V3' ? 'boost/OUT+' : p)))
r = run('595 on 5V with 3.3V logic', sr5)
check(!r.reports[2].pass && r.reports[0].pass, '595 on 5 V with 3.3 V ESP32 logic: Lights fail (HC input threshold), Drive still passes')

// 11. servo without signal
r = run('servo without signal', full.filter((w) => w.join() !== 'esp/IO15,srv/SIG'))
check(!r.reports[1].pass && r.reports[0].pass && r.reports[2].pass, 'no servo signal: Steer fails, Drive and Lights still pass')

// 12. NPN low-side switch: GPIO -> 1k -> base, LED + 220 from 5V to collector, emitter to GND
const c2 = new Circuit([
  {id: 'batt', spec: {kind: 'battery', p: {volts: 6}}}, {id: 'boost', spec: {kind: 'boost'}},
  {id: 'esp', spec: {kind: 'mcu', gpios: ['IO4']}}, {id: 'q', spec: {kind: 'npn'}}, {id: 'rb', spec: {kind: 'resistor', p: {ohms: 1000}}},
  {id: 'rl', spec: {kind: 'resistor', p: {ohms: 220}}}, {id: 'led', spec: {kind: 'led'}},
])
const w2 = [['batt/+', 'boost/IN+'], ['batt/-', 'boost/IN-'], ['boost/OUT+', 'esp/5V'], ['boost/OUT-', 'esp/GND'],
  ['esp/IO4', 'rb/1'], ['rb/2', 'q/B'], ['boost/OUT+', 'rl/1'], ['rl/2', 'led/A'], ['led/K', 'q/C'], ['q/E', 'boost/OUT-']]
const e2 = c2.explore(w2)
check(!!e2.effects['led:lit'], 'NPN switch lights the LED when the GPIO is high')
const off = c2.solve(w2, {gpio: {'esp/IO4': 0}, sr: {}, pressed: {}})
check(off.parts['led'].lit < 0.01, 'NPN switch: LED dark when the GPIO is low')
const on = c2.solve(w2, {gpio: {'esp/IO4': 1}, sr: {}, pressed: {}})
console.log('   npn on: led current', (on.parts['led'].i * 1000).toFixed(1), 'mA, Vce', on.parts['q'].v.toFixed(2))

console.log(fails === 0 ? '\nALL OK' : '\n' + fails + ' FAILED')
process.exit(fails === 0 ? 0 : 1)
