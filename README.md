# Sun Shadow Modeling on Site

Simple, static sun-shadow modeling on site based on a rectangular building footprint and grid ground.

## Getting started

No build tools are required. Open `index.html` in a modern browser or start a lightweight web server:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000/> to interact with the shadow explorer.

## Features

- Adjustable building width, depth, height, rotation, and plan offsets.
- Sun controls for azimuth (degrees clockwise from north) and altitude above the horizon.
- Configurable ground size and grid spacing with a live canvas plan view.
- Live readout of shadow length, footprint area, and current sun vector.
