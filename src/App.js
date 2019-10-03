import React from 'react';
import './App.css';

const INVARIANT_CHECKS = true; // keep as `true` during development
const SHOW_HISTORY = false;
const STEP_SPEED = 50;
const USE_RAF = false;
const SHOW_DEBUG = false;
const USE_ANIMATION = false;

const maxDensity = 2 / 10; // 2 vehicles per 10 meters
const peakDensity = maxDensity / 3;
const peakFlow = 40 / 60; // 20 vehicles per 60 seconds

/**
  * @param density Vehicles per meter
  * @return the flow for the given density in vehicles per second.
 */
function createFlowOfDensity({
  maxDensity,
  peakDensity,
  peakFlow,
}) {
  return (density) => {
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
}

const flowOfDensity = createFlowOfDensity({
  maxDensity,
  peakDensity,
  peakFlow,
})

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
    events: [...Array(1).keys()].map(index => {
      const startTime = 10 + (index * 25);
      return {
        id: index + 1,
        position: 400 - (index * 20),
        startTime,
        endTime: startTime + 20,
      };
    }),
    vehicles: [...Array(400).keys()].map(index => {
      return {
        id: index + 1,
        position: 400 - 20 * index, // meters
        velocity: 10, // meters / sec (~25 miles / hour)
        blockedByEvent: undefined,
        status: undefined,
      }
    }).reverse()
  }
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
        console.log(current);
        console.log(next);
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
        // console.log('velocity', velocity);
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
      for (let i = 0; i < 200; i++) {
        this._simulationState = nextState(this._simulationState, dt);
        this._history.push(this._simulationState);
      }
    }
    this.state = {
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
    return x * 7;
  }
  scaleY(y) {
    return this.state.height - 20 - y;
  }
  _context = undefined;
  componentDidMount() {
    this.canvasRedraw()
  }
  canvasRedraw() {
    let xOffset = 100;
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
    // context.clearRect(0, 0, canvas.width, canvas.height);
    history.map(simulation => {
      const { time } = simulation;
      simulation.events.map(event => {
        const isRed = event.startTime < time && time < event.endTime;
        const x = xOffset + this.scaleX(simulation.time);
        const y = this.scaleY(event.position);
        if (isRed) {
          context.beginPath();
          context.moveTo(x - 1, y);
          context.lineTo(x + 1, y);
          context.strokeWidth = 1;
          context.strokeStyle = 'rgba(0, 0, 0, 0.4)'
          context.stroke();
        }
      });
      simulation.vehicles.forEach(vehicle => {
        let x = this.scaleX(simulation.time) + xOffset;
        let y = this.scaleY(vehicle.position);
        context.beginPath();
        context.arc(x, y, 1, 0, 2 * Math.PI, false);
        context.fillStyle = 'red';
        context.fill();
      });
    });
  }
  render() {
    let xOffset = 100;
    let { simulation, width, height, history } = this.state;
    return <div>
      <canvas width={`${width * 2}px`} height={`${height * 2}px`} ref={this._canvasRef}  style={{width: '100%', height: '100%' }}/>
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

export default App;
