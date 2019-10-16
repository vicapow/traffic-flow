
import React from 'react';
import './App.css';
import * as d3 from 'd3';

const INVARIANT_CHECKS = true; // keep as `true` during development
const SHOW_HISTORY = false;
const STEP_SPEED = 50;
const USE_RAF = false;
const SHOW_DEBUG = false;
const USE_ANIMATION = false;
// 2 vehicles per 10 meters
const maxDensity = 2 / 10;
// Density of maximum flow
const peakDensity = maxDensity / 3;
// 20 vehicles per 60 seconds
const peakFlow = 40 / 60;
const TIME_BOUNDS = [-100, 150];
const POSITION_BOUNDS = [-100, 1000];
const NUM_STEPS = 400;

function cross(a, b) {
  // cross product of two 2D vectors is just the magnitude for a 3x3 vector pointing out perpendicular to the two input vectors.
  return a[0] * b[1] - a[1] * b[0];
}

function minus(a, b) {
  return [ a[0] - b[0], a[1] - b[1] ];
}

function add(a, b) {
  return [ a[0] + b[0], a[1] + b[1] ];
}

function scale(a, s) {
  return [ a[0] * s, a[1] * s ];
}

function magnitude(a) {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
}

function getSegmentPointAbovePoint(point, segment) {
  const yHat = [0, 1];
  const ray = [ point, add(point, yHat) ];
  return rayIntersectsSegment(ray, segment);
}

/**
  * @param ray A [ [number, number], [number, number] ] ray starting from ray[0] pointing through the point ray[1].
 */
function rayIntersectsSegment(ray, segment) {
  const q = segment[0];
  const s = minus(segment[1], segment[0]);
  const p = ray[0];
  // a ray of unit length pointing up.
  const r = minus(ray[1], ray[0]);
  const t = cross(minus(q, p), s) / cross(r, s);
  // TODO handle collinear lines.
  return add(p, scale(r, t));
}

function getClosestSegmentAboveInterface(point, interfaces) {
  let minDistance = -1;
  let closestPoint = undefined;
  let closestInterface = undefined;
  for (let intrface of interfaces) {
    const segmentPoint = getSegmentPointAbovePoint(point, intrface.coordinates);
    const delta = minus(segmentPoint, point);
    if (delta[1] < 0) {
      // no segments above
      continue;
    }
    const distance = magnitude(delta);
    if (minDistance === -1 || distance < minDistance) {
      minDistance = distance;
      closestPoint = segmentPoint;
      closestInterface = intrface;
    }
  }
  if (minDistance === -1) {
    return null;
  }
  return { closestPoint, closestInterface };
}

/**
  * @param density Vehicles per meter
  * @return the flow for the given density in vehicles per second.
 */
function createFlowOfDensity({
  maxDensity,
  peakDensity,
  peakFlow,
}) {
  // our fundemental diagram.
  const flow = (density) => {
    if (density < 0) {
      return 0;
    }
    if (density < peakDensity) {
      let slope = peakFlow / peakDensity;
      return density * slope + 0;
    } else if (density < maxDensity) {
      let slope = (0 - peakFlow) / (maxDensity - peakDensity);
      return density * slope + (-maxDensity * slope);
    } else {
      return 0;
    }
  }
  flow.maxDensity = maxDensity;
  flow.peakDensity = peakDensity;
  flow.peakFlow = peakFlow;
  return flow;
}

const flowOfDensity = createFlowOfDensity({
  maxDensity,
  peakDensity,
  peakFlow,
});

if (INVARIANT_CHECKS) {
  if (flowOfDensity(0) !== 0) {
    throw new Error(`min density should have flow of zero`);
  }
  if (flowOfDensity(maxDensity) !== 0) {
    throw new Error(`max density should have flow of zero`);
  }
  if (flowOfDensity(peakDensity) !== peakFlow) {
    throw new Error(`peak density should equity peak flow instead got ${flowOfDensity(peakDensity)}`);
  }
}

function initState() {
  return {
    time: 0,
    events: [...Array(0).keys()].map(index => {
      const startTime = 10 + (index * 30);
      return {
        id: index + 1,
        position: 400 - (index * 0),
        startTime,
        endTime: startTime + 10,
      };
    }).concat([
      {
        id: 100000,
        position: 500,
        startTime: 10,
        endTime: 20,
      }
    ]),
    vehicles: [...Array(400).keys()].map(index => {
      return {
        id: index + 1,
        position: 400 - 20 * index + 0.01, // meters
        velocity: 10, // meters / sec (~25 miles / hour)
        blockedByEvent: undefined,
        status: undefined,
      }
    }).reverse()
  }
}

function getInterfaces(events, flowOfDensity, timeBounds, positionBounds, startVehiclePosition) {
  const { peakDensity, maxDensity } = flowOfDensity;
  const emptyInterface = {
    coordinates: [
      [ timeBounds[0], positionBounds[1] ],
      [ timeBounds[1], positionBounds[1] ]
    ],
    densityAbove: undefined,
    densityBelow: undefined,
  };

  const density = 1 / 100000;
  const start = [0, startVehiclePosition];
  const velocity = flowOfDensity(density) / density;
  const ray = [
    start,
    [start[0] + 1, start[1] + velocity]
  ];
  const point = rayIntersectsSegment(ray, emptyInterface.coordinates);
  const inflowInterface = {
    coordinates: [
      start,
      point,
    ],
    densityAbove: undefined,
    densityBelow: density,
  };
  const interfaces = [emptyInterface, inflowInterface];

  events.forEach(event => {
    const start = [ event.startTime, event.position ];
    const end = [ event.endTime, event.position ];
    const { closestInterface } = getClosestSegmentAboveInterface(start, interfaces);
    const densityBelow = maxDensity;
    const densityAbove = closestInterface.densityBelow;
    interfaces.push({
      coordinates: [ start, end ],
      densityAbove,
      densityBelow,
    });
    let ku = densityAbove;
    let qu = flowOfDensity(ku);
    let kj = densityBelow;
    let qj = flowOfDensity(kj);
    console.log('ku', ku, 'qu', qu, 'kj', kj, 'qj', qj);
    const frontInterfaceSlope = (qu - qj) / (ku - kj);
    console.log('frontInterfaceSlope', frontInterfaceSlope);
    interfaces.push({
      coordinates: [ start, add(start, scale([1, frontInterfaceSlope], 100)) ],
      densityAbove: densityBelow,
      densityBelow: closestInterface.densityBelow,
    });
  });
  console.log(interfaces);
  return interfaces;
}

/**
  * @param state the current state
  * @param dt delta time in seconds
  * @returns The next state
  */
function nextState(state, dt) {
  if (INVARIANT_CHECKS) {
    for (let i = 0; i < state.vehicles.length - 1; i++) {
      let next = state.vehicles[i + 1];
      let current = state.vehicles[i];
      if (next.position < current.position) {
        console.error(current);
        console.error(next);
        throw new Error(`Order invariant failed current: ${current.id} next:  ${next.id}`);
      }
    }
  }
  const time = state.time + dt;
  const eventsByID = new Map();
  const activeEvents = state.events.filter(event => {
    const isActive = event.startTime < time && time < event.endTime;
    if (isActive) {
      eventsByID.set(event.id, event);
    }
    return isActive;
  });
  return {
    ...state,
    time,
    vehicles: [
      ...state.vehicles.map((vehicle, index) => {
        let { position, velocity, status, blockedByEvent } = vehicle;
        if (status === 'BLOCKED' && blockedByEvent !== undefined) {
          if (!eventsByID.has(blockedByEvent)) {
            // no longer blocked by this event.
            status = undefined;
            blockedByEvent = undefined;
          } else {
            return vehicle;
          }
        } else {
          for (let event of activeEvents) {
            if (position < event.position && (position + (velocity * dt)) >= event.position) {
              return {...vehicle, position, velocity: 0, status: 'BLOCKED', blockedByEvent: event.id };
            }
          }
        }
        // check spacing
        let nextVehicle = state.vehicles[index + 1];
        // spacing is distance between cars. or distance per vehicle.
        let spacing = nextVehicle ? (nextVehicle.position - vehicle.position) : 10000;
        // density is 1 / spacing
        let density = 1 / spacing; // vehicles / m
        let flow = flowOfDensity(density);
        velocity = flow / density;
        return {
          ...vehicle,
          velocity,
          status,
          blockedByEvent,
          position: position + velocity * dt,
        }
      })
    ]
  }
}

class App extends React.Component {
  constructor() {
    super();
    this.timestamp = Date.now() / 1000;
    this._simulationState = initState();
    this._history = [this._simulationState];
    let dt = 0.5; // second
    if (!USE_ANIMATION) {
      for (let i = 0; i < NUM_STEPS; i++) {
        this._simulationState = nextState(this._simulationState, dt);
        this._history.push(this._simulationState);
      }
    }
    this.state = {
      scale: 0.4,
      xOffset: 1300,
      yOffset: -600,
      simulation: this._simulationState,
      history: this._history,
      width: window.innerWidth,
      height: window.innerHeight,
    };
    if (USE_ANIMATION && USE_RAF) {
      window.requestAnimationFrame(this.raf);
    } else if (USE_ANIMATION) {
      setInterval(() => {
        this.updateLoop(0.5);
      }, STEP_SPEED);
    }
    this._canvasRef = React.createRef();
    let renderRAF = () => {
      this.canvasRedraw();
      window.requestAnimationFrame(renderRAF);
    };
    if (USE_ANIMATION) {
      window.requestAnimationFrame(renderRAF);
    }
  }
  raf = () => {
    let ts = Date.now() / 1000;
    // const dt = (ts - this.timestamp) * 10;
    this.updateLoop(0.5);
    this.timestamp = ts;
    window.requestAnimationFrame(this.raf);
  }
  updateLoop = (dt) => {
    this._simulationState = nextState(this._simulationState, dt);
    if (SHOW_HISTORY) {
      this._history.push(this._simulationState);
    } else {
      this._history = [ this._simulationState ];
    }
    this.setState({ simulation: this._simulationState, history: this._history });
  }
  scaleX(x) {
    return (this.state.xOffset + x * 7) * this.state.scale;
  }
  scaleY(y) {
    return (this.state.height - this.state.yOffset - y) * this.state.scale;
  }
  _context = undefined;
  componentDidMount() {
    this.canvasRedraw();
    window.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.setState({
        scale: event.deltaY * -0.01 + this.state.scale
      });
    });
    window.addEventListener('keydown', (event) => {
      if (event.keyCode === 37) {
        // left
        this.setState({
          xOffset: this.state.xOffset + 10
        });
      } else if (event.keyCode === 39) {
        // right
        this.setState({
          xOffset: this.state.xOffset - 10
        });
      } else if (event.keyCode === 40) {
        // down
        this.setState({
          yOffset: this.state.yOffset + 10
        });
      } else if (event.keyCode === 38) {
        // up
        this.setState({
          yOffset: this.state.yOffset - 10
        });
      }
    });
  }
  componentDidUpdate() {
    this.canvasRedraw();
  }
  canvasRedraw() {
    let { simulation, width, height, history } = this.state;
    const canvas = this._canvasRef.current;
    var dpr = window.devicePixelRatio || 1;
    if (!this._context) {
      // Get the size of the canvas in CSS pixels.
      var rect = canvas.getBoundingClientRect();
      // Give the canvas pixel dimensions of their CSS
      // size * the device pixel ratio.
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const context = canvas.getContext('2d');
      context.scale(dpr, dpr);
      this._context = context;
    }
    let context = this._context;
    context.clearRect(0, 0, canvas.width, canvas.height);

    // draw bounds
    context.beginPath();
    context.moveTo(this.scaleX(TIME_BOUNDS[0]), this.scaleY(POSITION_BOUNDS[0]));
    context.lineTo(this.scaleX(TIME_BOUNDS[1]), this.scaleY(POSITION_BOUNDS[0]));
    context.lineTo(this.scaleX(TIME_BOUNDS[1]), this.scaleY(POSITION_BOUNDS[1]));
    context.lineTo(this.scaleX(TIME_BOUNDS[0]), this.scaleY(POSITION_BOUNDS[1]));
    context.lineTo(this.scaleX(TIME_BOUNDS[0]), this.scaleY(POSITION_BOUNDS[0]));
    context.fillStyle = 'rgba(0, 255, 0, 0.1)';
    context.fill();

    const trajectories = new Map();
    history.forEach(simulation => {
      simulation.vehicles.forEach(vehicle => {
        const trajectory = trajectories.get(vehicle.id) || [];
        trajectory.push({vehicle, time: simulation.time});
        trajectories.set(vehicle.id, trajectory);
      });
    });
    for (let [id, trajectory] of trajectories) {
      let previous = trajectory[0];
      for (let j = 1; j < trajectory.length; j++) {
        const pX = this.scaleX(previous.time);
        const pY = this.scaleY(previous.vehicle.position);
        const cX = this.scaleX(trajectory[j].time);
        const cY = this.scaleY(trajectory[j].vehicle.position);
        context.beginPath();
        context.moveTo(pX, pY);
        context.lineTo(cX, cY);
        context.strokeWidth = 1;
        context.strokeStyle = 'rgba(0, 0, 0, 0.1)'
        context.stroke();
        previous = trajectory[j];
      }
    }
    history[0].events.forEach(event => {
      const sX = this.scaleX(event.startTime);
      const sY = this.scaleY(event.position);
      const eX = this.scaleX(event.endTime);
      const eY = this.scaleY(event.position);
      context.beginPath();
      context.moveTo(sX, sY);
      context.lineTo(eX, eY);
      context.strokeWidth = 1;
      context.strokeStyle = 'rgba(255, 0, 0, 1)';
      context.stroke();
      context.beginPath();
      context.arc(sX, sY, 2, 0, 2 * Math.PI, false);
      context.fillStyle = 'red';
      context.fill();
      context.beginPath();
      context.arc(eX, eY, 2, 0, 2 * Math.PI, false);
      context.fillStyle = 'red';
      context.fill();
    });

    const startVehiclePosition = history[0].vehicles[history[0].vehicles.length - 1].position;
    const interfaces = getInterfaces(history[0].events, flowOfDensity, TIME_BOUNDS, POSITION_BOUNDS, startVehiclePosition);
    interfaces.forEach(intrface => {
        const sX = this.scaleX(intrface.coordinates[0][0]);
        const sY = this.scaleY(intrface.coordinates[0][1]);
        const eX = this.scaleX(intrface.coordinates[1][0]);
        const eY = this.scaleY(intrface.coordinates[1][1]);
        context.beginPath();
        context.moveTo(sX, sY);
        context.lineTo(eX, eY);
        context.strokeWidth = 1;
        context.strokeStyle = 'rgba(0, 255, 0, 1)';
        context.stroke();
    });

  }

  render() {
    let { simulation, width, height, history } = this.state;
    return <div>
      <canvas width={`${width * 2}px`} height={`${height * 2}px`} ref={this._canvasRef}  style={{width: '100%', height: '100%' }}/>
      <FundementalDiagram flowOfDensity={flowOfDensity} />
      {SHOW_DEBUG ? <div style={{position: 'absolute', left: width / 2, top: 0}}>
        <code>
          <pre>
            {JSON.stringify(this.state.simulation, null, 2)}
          </pre>
        </code>
      </div> : null}
    </div>;
  }
}

class FundementalDiagram extends React.Component {
  constructor(props) {
    super(props);
    this.myRef = React.createRef();
  }
  componentDidMount() {
    this.modifyDOM();
  }
  componentDidUpdate() {
    this.modifyDOM();
  }
  modifyDOM() {
    const node = this.myRef.current;
    d3.select(node).select('.axisX').call(this._axisX);
    d3.select(node).select('.axisY').call(this._axisY);
  }
  render() {
    const padding = {
      left: 25,
      top: 10,
      right: 10,
      bottom: 20,
    }
    const width = 100, height = 100;
    const { flowOfDensity } = this.props;
    const minX = 0, maxX = flowOfDensity.maxDensity;
    let minY = -1, maxY = -1;
    const samples = 100;
    const stepSize = (maxX - minX) / samples;
    const data = [];
    for (let i = 0; i < samples; i++) {
      const x = i * stepSize;
      const y = flowOfDensity(x);
      if (minY === -1 || y < minY) {
        minY = y;
      }
      if (maxY === -1 || y > maxY) {
        maxY = y;
      }
      data.push([x, y]);
    }
    console.log(data.map(([x,y]) => y));
    const scaleX = d3.scaleLinear().domain([minX, maxX]).range([padding.left, width - padding.right]);
    const scaleY = d3.scaleLinear().domain([minY, maxY]).range([height - padding.bottom, padding.top]);
    this._axisX = d3.axisBottom(scaleX).ticks(2);
    this._axisY = d3.axisLeft(scaleY).ticks(5);
    return <svg width="100px" height="100px" style={{position: 'absolute', left: 10, top: 10}} ref={this.myRef}>
      <g class="axisX" transform={`translate(0, ${height - padding.bottom})`} />
      <g class="axisY" transform={`translate(${padding.left}, 0)`} />
      <path fill="none" stroke="black" d={`M ${data.map(([x, y]) => `${scaleX(x)},${scaleY(y)} L`).join(' ')}`} />
    </svg>
  }
}

export default App;
