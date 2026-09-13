# Google Maps 3D Reference

## Role in the project

Render buildings, fixed aerial route corridors, altitude-aware markers/lines, a hazard geofence, and deterministic drone animation.

## Official documentation

- [3D Maps overview](https://developers.google.com/maps/documentation/javascript/3d/overview)
- [Get started with 3D Maps](https://developers.google.com/maps/documentation/javascript/3d/get-started)
- [Control the camera](https://developers.google.com/maps/documentation/javascript/3d/camera-position)
- [Markers in 3D](https://developers.google.com/maps/documentation/javascript/3d/marker-add)
- [Lines and shapes in 3D](https://developers.google.com/maps/documentation/javascript/3d/shapes-lines)
- [3D models](https://developers.google.com/maps/documentation/javascript/3d/models)
- [Altitude modes](https://developers.google.com/maps/documentation/javascript/3d/altitude-modes)
- [API key best practices](https://developers.google.com/maps/api-security-best-practices)

## Setup checklist

- Enable the required Maps JavaScript/3D capability in the correct Google Cloud project.
- Ensure billing is attached if required by Google Maps Platform.
- Restrict the browser key to the Maps APIs actually used.
- Add website/referrer restrictions for localhost and the deployed domain.
- Put the browser key in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

## Project caution

Aerial View is a rendered video product and is not the right control surface for an interactive drone-level route simulation. Use Maps 3D and control camera center, range, tilt, and heading.

