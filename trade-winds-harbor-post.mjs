import * as THREE from './assets/vendor/three.module.js';

// Depth-aware contact shading, restrained lantern bloom and photographic focus.
// The complete 3D scene is rendered first; this pass uses its actual depth buffer.
export class HarborPost {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.uniforms = {
      colorMap: {value:this.target.texture}, depthMap:{value:this.target.depthTexture},
      pixel:{value:new THREE.Vector2(1,1)}, inverseProjection:{value:new THREE.Matrix4()},
      focus:{value:23},
    };
    this.material = new THREE.ShaderMaterial({
      uniforms:this.uniforms, depthTest:false, depthWrite:false,
      vertexShader:'varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`
        precision highp float;
        varying vec2 uvScreen;
        uniform sampler2D colorMap, depthMap;
        uniform vec2 pixel;
        uniform mat4 inverseProjection;
        uniform float focus;
        vec3 viewPoint(vec2 uv){
          vec4 p=inverseProjection*vec4(uv*2.-1.,texture2D(depthMap,uv).r*2.-1.,1.);
          return p.xyz/p.w;
        }
        void main(){
          vec2 uv=uvScreen;
          vec3 p=viewPoint(uv);
          vec3 dx=dFdx(p),dy=dFdy(p);
          vec3 normal=normalize(cross(dx,dy));
          float occlusion=0.;
          for(int i=0;i<16;i++){
            float a=float(i)*2.399963;
            float r=3.+float(i)*1.15;
            vec3 delta=viewPoint(uv+vec2(cos(a),sin(a))*pixel*r)-p;
            float distance=length(delta);
            occlusion+=max(0.,dot(normal,normalize(delta))-.09)*exp(-distance*2.8);
          }
          float ao=clamp(1.-occlusion*.11,.62,1.);
          float blur=clamp(abs((-p.z-focus)/max(1.,-p.z))*7.,0.,4.5);
          vec3 color=texture2D(colorMap,uv).rgb;
          vec3 blurred=color;float weight=1.;vec3 bloom=vec3(0.);
          for(int i=0;i<24;i++){
            float a=float(i)*2.399963;
            vec2 dir=vec2(cos(a),sin(a));
            float r=sqrt((float(i)+.5)/24.);
            blurred+=texture2D(colorMap,uv+dir*pixel*r*blur).rgb;weight+=1.;
            vec3 glow=texture2D(colorMap,uv+dir*pixel*(2.+r*16.)).rgb;
            bloom+=max(glow-vec3(1.15),0.);
          }
          color=(blurred/weight)*ao+bloom*(.16/24.);
          float edge=dot((uv-.5)*vec2(1.1,1.),(uv-.5)*vec2(1.1,1.));
          color*=1.-edge*.28;
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
    this.camera = new THREE.Camera();
  }
  resize(width,height) {
    const ratio=this.renderer.getPixelRatio();
    this.target.setSize(Math.round(width*ratio),Math.round(height*ratio));
    this.uniforms.pixel.value.set(1/(width*ratio),1/(height*ratio));
  }
  render(scene,camera,focusObject) {
    camera.updateMatrixWorld();
    this.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    if(focusObject){
      const p=focusObject.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse);
      this.uniforms.focus.value=-p.z;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene,camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene,this.camera);
  }
}
