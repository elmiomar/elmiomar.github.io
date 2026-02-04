---
layout:     minimal-post
title:      Building a Simulation First IoT Component SDK
date:       2021-11-15 10:00:00
summary:    How I built a Python SDK for IoT and Cyber Physical Systems that works without hardware, with realistic simulation, a web dashboard, and YAML based configuration.
categories:
 - Backend
 - IoT
comments: true
tags:
 - Python
 - IoT
 - Simulation
 - React
 - FastAPI
---

I recently built an IoT Component SDK for developing Cyber Physical Systems (CPS) and Internet of Things applications. The key insight was designing it "simulation first." The entire system works without any physical hardware, using realistic environmental models instead.

## The Problem

When developing IoT systems, you typically need access to sensors, actuators, and microcontrollers. This creates friction: hardware is expensive, might not be available, and setting up a physical testbed takes time. Yet you still need to validate your control logic, test edge cases, and demonstrate the system to stakeholders.

I wanted an SDK where the same component code runs in simulation during development and on real hardware in production, with zero changes.

## The Architecture

The SDK is built around a few core concepts:

**Components** are the building blocks: sensors that read values, actuators that control devices, and processors that transform data or make decisions. Each component has a standard interface for publishing and subscribing to messages.

**Hardware Abstraction Layer (HAL)** provides multiple backends for each component type:
- `mock` returns fixed values for unit testing
- `simulated` uses physical models with realistic noise, drift, and failures
- `hardware` connects to real GPIO, I2C, SPI devices

**Message Broker** handles pub/sub communication between components using MQTT style topic wildcards. A local in memory broker works for single process systems; an MQTT broker enables distributed deployments.

**Simulation Engine** orchestrates time (with 1x to 100x acceleration), environment models, and fault injection for testing resilience.

## Environment Simulation

The simulation includes realistic physical models:

```python
class SoilMoistureModel:
    """Simulates soil moisture dynamics."""

    def update(self, dt_hours: float, temperature: float, humidity: float) -> float:
        # Evaporation increases with temperature and decreases with humidity
        evap_rate = self.base_evaporation * (1 + 0.05 * (temperature - 20))
        evap_rate *= (1 - humidity / 200)

        # Irrigation adds moisture
        if self.is_irrigating:
            self.moisture += self.irrigation_rate * dt_hours

        # Evaporation removes moisture
        self.moisture -= evap_rate * dt_hours

        return self.moisture
```

Temperature follows a daily sine wave, humidity responds to temperature and rain, and soil moisture accounts for evaporation, irrigation, and drainage. The models are simplified but capture the dynamics needed for testing control logic.

## Hysteresis Control

For actuator control, I implemented a hysteresis controller to prevent rapid on/off cycling:

```yaml
# Turn pump ON when moisture < 30%, OFF when > 60%
irrigation-controller:
  type: controller.hysteresis
  config:
    input_topic: sensors/soil/zone1
    output_topic: actuators/pump/command
    low_threshold: 30.0
    high_threshold: 60.0
```

The dead band between 30% and 60% ensures the pump does not oscillate when moisture hovers around a single threshold.

## Web Dashboard

The SDK includes a React dashboard for monitoring and control:

- **System Overview**: Component count, message throughput, uptime
- **Real time Charts**: Sensor readings with Recharts
- **Simulation Controls**: Start/stop/pause, time acceleration
- **Message Inspector**: Filter and inspect pub/sub traffic
- **Environment Panel**: Current temperature, humidity, soil moisture

The backend is FastAPI with WebSocket support for real time updates. The frontend polls the REST API and receives push updates via WebSocket.

## YAML Configuration

Systems are defined declaratively in YAML:

```yaml
system:
  name: "smart-greenhouse"
  mode: "simulation"
  simulation:
    time_scale: 10.0

components:
  - id: soil-sensor-1
    type: sensor.soil_moisture
    config:
      interval: 30
      topic: sensors/soil/zone1

  - id: pump-1
    type: actuator.pump
    config:
      command_topic: actuators/pump/command
      flow_rate: 10.0

  - id: irrigation-controller
    type: controller.hysteresis
    config:
      input_topic: sensors/soil/zone1
      output_topic: actuators/pump/command
      low_threshold: 30.0
      high_threshold: 60.0
```

A CLI loads and runs the system:

```bash
iot-sdk run greenhouse.yaml
```

The `SystemBuilder` parses the config, instantiates components via a factory, wires them to the broker and simulation engine, and manages the lifecycle.

## Fault Injection

For resilience testing, the simulation supports fault injection:

- `sensor_stuck` means the sensor returns the same value repeatedly
- `sensor_drift` means readings drift from true value over time
- `actuator_stuck_on` / `actuator_stuck_off` means the actuator ignores commands
- `communication_delay` means messages are delayed

This lets you test how control logic handles degraded conditions without physically breaking hardware.

## What I Learned

**Simulation fidelity matters.** Early versions with simple random values did not exercise the control logic meaningfully. Adding realistic dynamics (evaporation that depends on temperature, moisture that saturates and drains) made the simulation useful for finding bugs.

**The HAL abstraction pays off.** Swapping `backend: simulated` for `backend: hardware` in the config is all it takes to run on real devices. The component code stays the same.

**YAML configuration is powerful.** Defining systems declaratively makes it easy to version control configurations, share them with teammates, and spin up variations for testing.

## Code

The full SDK is on GitHub. It includes:
- Core component framework with pub/sub messaging
- Simulation engine with physical models
- Sensors: temperature, humidity, soil moisture
- Actuators: pump, relay
- Processors: threshold alerts, hysteresis control
- React dashboard with real time charts
- CLI for running systems from YAML

If you are building IoT applications and want to iterate quickly without hardware, this approach might be worth exploring.
