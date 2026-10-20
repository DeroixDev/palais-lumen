// Shader patches for the look finish (applied once, before any shader compiles):
// - Height haze: every fogged material also fades into a haze colour near the ground/water
//   (soft height fog). Driven by shared uniforms; with density 0 it is exactly the old fog.
// - Glow mask: opaque materials write a bloom mask into the alpha channel (0 for everything,
//   the material's GLOW value for lamps/neon, the emissive brightness for GLOW_EMI windows).
//   The post-processing blooms colour × mask, so only lamps, neon and lit windows glow. The
//   canvas has no alpha channel, so drawing straight to the screen is unchanged.
// - Display-space output into the post target: while the post chain renders the scene into its
//   (linear 8-bit) target, materials still encode to sRGB like for the screen (FX_G[3] = 1), so
//   dark nights keep their precision and the target needs no slow sRGB format.
// - Ground contact shade on toon materials: walls darken softly towards the ground (cheap
//   ambient occlusion: nothing looks like it floats) and wet ground darkens in the rain.
// The shared uniforms are typed arrays: three passes them by reference into every material, so
// one write per frame reaches all shaders. Boards set them before they render and reset after.

import * as THREE from 'three';

/** Height haze: density (0..1), full-haze height, zero-haze height, distance scale. */
export const FOG_H = new Float32Array([0, -1.5, 3, 0.02]);
/** Height haze colour (linear). */
export const FOG_HC = new Float32Array([1, 1, 1]);
/** Ground shade strength, its height, wetness, sRGB output into a render target (0/1). */
export const FX_G = new Float32Array([0, 0.9, 0, 0]);

export function resetShared() {
  FOG_H[0] = 0;
  FX_G[0] = 0;
  FX_G[2] = 0;
}

const C = THREE.ShaderChunk as unknown as Record<string, string>;
let done = false;
export function patchShaders() {
  if (done) return;
  done = true;
  C.fog_pars_vertex = `#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogW;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogW = cameraPosition + ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec4 fogH;
	uniform vec3 fogHC;
	varying float vFogDepth;
	varying vec3 vFogW;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	if ( fogH.x > 0.0 ) {
		float hz = clamp( ( fogH.z - vFogW.y ) / max( fogH.z - fogH.y, 0.001 ), 0.0, 1.0 );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogHC, fogH.x * hz * hz * ( 1.0 - exp( - vFogDepth * fogH.w ) ) );
	}
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
  C.colorspace_pars_fragment += `
uniform vec4 fxG;
`;
  C.colorspace_fragment = `gl_FragColor = linearToOutputTexel( gl_FragColor );
if ( fxG.w > 0.5 ) gl_FragColor = sRGBTransferOETF( gl_FragColor );`;
  C.opaque_fragment = `#ifdef OPAQUE
	#if defined( GLOW_EMI )
		diffuseColor.a = clamp( dot( totalEmissiveRadiance, vec3( 0.45 ) ) * GLOW_EMI, 0.0, 1.0 );
	#elif defined( GLOW )
		diffuseColor.a = GLOW;
	#else
		diffuseColor.a = 0.0;
	#endif
#endif
#ifdef USE_TRANSMISSION
	diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`;
  C.fx_ground = `#if defined( USE_FOG ) && !defined( FX_NO_GROUND )
	if ( fxG.x + fxG.z > 0.0 ) {
		float fxUp = abs( ( vec4( normal, 0.0 ) * viewMatrix ).y );
		float fxK = vFogW.y < -0.06 ? 1.0 : smoothstep( 0.0, fxG.y, vFogW.y );
		diffuseColor.rgb *= mix( 1.0, 1.0 - fxG.x * ( 1.0 - fxK ), 1.0 - fxUp );
		diffuseColor.rgb *= 1.0 - fxG.z * 0.2 * fxUp;
	}
#endif`;
  const lib = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform>; fragmentShader: string }>;
  lib.toon.fragmentShader = lib.toon.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\t#include <fx_ground>');
  const extra = { fogH: { value: FOG_H }, fogHC: { value: FOG_HC }, fxG: { value: FX_G } };
  Object.assign(THREE.UniformsLib.fog, extra);
  for (const k of Object.keys(lib)) {
    if (!lib[k].uniforms) continue;
    if (lib[k].uniforms.fogColor) Object.assign(lib[k].uniforms, extra);
    else lib[k].uniforms.fxG = { value: FX_G };
  }
}
patchShaders();

/** Marks a material as glowing (bloom mask `k`, 0..1). */
export function glow<M extends THREE.Material>(m: M, k = 1): M {
  m.defines = { ...(m.defines ?? {}), GLOW: k.toFixed(3) };
  m.needsUpdate = true;
  return m;
}
/** A lit material whose emissive light glows (lit windows): mask = emissive brightness × k. */
export function glowEmi<M extends THREE.Material>(m: M, k = 1): M {
  m.defines = { ...(m.defines ?? {}), GLOW_EMI: k.toFixed(3) };
  m.needsUpdate = true;
  return m;
}
/** Transparent material that must not touch the bloom mask (normal blending on colour only). */
export function keepMask<M extends THREE.Material>(m: M, additive = false): M {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}
