"use client";

import { useCallback } from "react";
import { useLocalNodes } from "@react-three/fiber/webgpu";
import {
  color,
  max,
  mix,
  normalLocal,
  positionLocal,
  smoothstep,
} from "three/tsl";
import type { Node } from "three/webgpu";

import {
  PARK,
  PARK_AXIS_PATH_WIDTH,
  PARK_RING_PATH_INNER,
  PARK_RING_PATH_OUTER,
  TOWER_CLEARING_RADIUS,
} from "./geography";
import { PARK_COLOR } from "./terrain-palette";

/** Soft analytic edges keep the tint from drawing a hard line on a facade. */
const EDGE = 0.55;
/** City-space height over which the fake bounce fades away. */
const BOUNCE_HEIGHT = 3.5;
/** A restrained tint now that the spatial mask is confirmed working. */
const BOUNCE_STRENGTH = 0.5;

function insideRange(value: Node<"float">, low: number, high: number) {
  return smoothstep(low - EDGE, low + EDGE, value).mul(
    smoothstep(high - EDGE, high + EDGE, value).oneMinus(),
  );
}

/**
 * A resolution-independent lookup for the green terrain directly below a
 * shaded point. The terrain is made from simple shapes, so matching those
 * shapes in the material is much cheaper than rendering and sampling a map.
 */
function makeGroundBounceColor(baseColor: string) {
  const p = positionLocal;
  const radius = p.x.mul(p.x).add(p.z.mul(p.z)).sqrt();

  const roundLawn = smoothstep(
    TOWER_CLEARING_RADIUS - EDGE,
    TOWER_CLEARING_RADIUS + EDGE,
    radius,
  ).oneMinus();
  const parkStrip = insideRange(p.x, PARK.minX, PARK.maxX).mul(
    insideRange(p.z, PARK.minZ, PARK.maxZ),
  );
  const park = max(roundLawn, parkStrip);

  // Paths sit above the lawn and therefore replace its sampled colour.
  const ringPath = smoothstep(
    PARK_RING_PATH_INNER - EDGE,
    PARK_RING_PATH_INNER + EDGE,
    radius,
  ).mul(
    smoothstep(
      PARK_RING_PATH_OUTER - EDGE,
      PARK_RING_PATH_OUTER + EDGE,
      radius,
    ).oneMinus(),
  );
  const axisPath = insideRange(
    p.x,
    -PARK_AXIS_PATH_WIDTH / 2,
    PARK_AXIS_PATH_WIDTH / 2,
  ).mul(insideRange(p.z, PARK_RING_PATH_OUTER, PARK.maxZ));
  const lawn = park.mul(max(ringPath, axisPath).oneMinus());
  // Buildings are rejected from the authored park by placement, so a
  // park-only mask can never reach them. The surrounding city floor reads
  // green under the environment too; treat it as a green receiver while the
  // visibly neutral paths remain excluded. River receivers are already
  // removed by the scatter's wider river keep-out.
  const greenGround = max(lawn, park.oneMinus());

  const linearHeightFade = smoothstep(
    0,
    BOUNCE_HEIGHT,
    max(p.y, 0),
  ).oneMinus();
  // Squaring holds the colour close to the foot of the facade instead of
  // washing the full height of the shorter buildings.
  const heightFade = linearHeightFade.mul(linearHeightFade);
  // Stylized bounce: lower walls and downward faces receive it; rooftops do
  // not. Giving walls the full term makes the gradient legible at hero scale.
  const groundFacing = normalLocal
    .normalize()
    .y.clamp(0, 1)
    .oneMinus();
  const amount = greenGround
    .mul(heightFade)
    .mul(groundFacing)
    .mul(BOUNCE_STRENGTH);

  const base = color(baseColor);
  // Brighten the sampled lawn colour into an indirect-light tint. This stays
  // in the diffuse channel, so it cannot bloom like an emissive workaround.
  const bounced = base.mul(0.16).add(color(PARK_COLOR).mul(3.2));
  return mix(base, bounced, amount);
}

/** Stable local-node wrapper so shared materials do not recompile on renders. */
export function useGroundBounceColor(baseColor: string) {
  const createNodes = useCallback(
    () => ({ colorNode: makeGroundBounceColor(baseColor) }),
    [baseColor],
  );
  return useLocalNodes(createNodes).colorNode;
}
