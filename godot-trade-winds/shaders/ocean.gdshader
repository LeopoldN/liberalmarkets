shader_type spatial;
render_mode unshaded, cull_back;
uniform float sea_time = 0.0;
varying vec3 world;
varying vec3 face;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
	return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
}
float atlantic(vec2 p) {
	float lon=p.x/220.0-80.0, lat=22.0-p.y/220.0;
	float edge=29.0;
	edge += -4.0*clamp((lon+82.0)/2.0,0.0,1.0);
	edge += -2.0*clamp((lon+80.0)/4.0,0.0,1.0);
	edge += -2.3*clamp((lon+76.0)/6.0,0.0,1.0);
	edge += -1.4*clamp((lon+70.0)/5.0,0.0,1.0);
	edge += -1.3*clamp((lon+65.0)/3.0,0.0,1.0);
	edge += -8.0*clamp((lon+62.0)/2.0,0.0,1.0);
	return smoothstep(-82.0,-80.8,lon)*smoothstep(-0.5,0.5,lat-edge);
}
float wave(vec2 p) {
	float swell=sin(p.x*.036+p.y*.021-sea_time*.85)*.34+sin(p.y*.057-p.x*.014+sea_time*.61)*.23;
	float rough=sin(p.x*.015+p.y*.023-sea_time*1.55)*1.8+sin(p.y*.044-p.x*.028+sea_time*1.19)*.8;
	return floor((swell+.6)*5.0)*.18-.8+atlantic(p)*(swell*1.8+rough);
}
void vertex() {
	vec2 center=MODEL_MATRIX[3].xz;
	VERTEX.y += wave(center);
	world=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
	face=NORMAL;
}
void fragment() {
	vec2 tile=floor((world.xz+6.0)/12.0), pixel=floor(world.xz/2.0)*2.0;
	float ocean=atlantic(world.xz);
	float depth=floor((noise(tile*.085)*.7+noise(tile*.21)*.3)*7.0)/7.0;
	vec3 c=mix(vec3(.012,.125,.19),vec3(.028,.265,.29),depth);
	c=mix(c,mix(vec3(.007,.035,.065),vec3(.025,.11,.155),depth),ocean*.88);
	float facet=sin(tile.x*.43+tile.y*.29-sea_time*.7)+sin(tile.y*.71-tile.x*.21+sea_time*.51);
	c*=.98+facet*.036;
	vec2 ripple=floor(pixel/4.0);
	float crest=sin(ripple.x*.59+ripple.y*.77-sea_time*.65+noise(ripple*.12)*4.0);
	float lip=smoothstep(.78,.99,crest)*step(.65,hash(floor(ripple/vec2(4.0,2.0))));
	c=mix(c,vec3(.17,.42,.43),lip*mix(.18,.44,ocean));
	float cap=step(mix(.985,.81,ocean),hash(floor(ripple/2.0)))*smoothstep(.62,.98,crest);
	c=mix(c,vec3(.57,.73,.65),cap*smoothstep(.3,.9,sin(sea_time*.55+hash(ripple)*6.28))*mix(.42,.85,ocean));
	ALBEDO=c*(.90+max(0.0,face.y)*.10)*1.6;
}
