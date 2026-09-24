from PIL import Image,ImageDraw,ImageOps
from pathlib import Path
root=Path('/Users/nick/Documents/GitHub/liberalmarkets/models/trade-winds/frigate-review')
ref=Image.open('/Users/nick/Downloads/image.png').convert('RGB')
out=Image.new('RGB',(1800,1620),'#0d2635');d=ImageDraw.Draw(out)
def put(im,box):
 im=ImageOps.contain(im,(box[2]-box[0],box[3]-box[1]));out.paste(im,(box[0]+(box[2]-box[0]-im.width)//2,box[1]+(box[3]-box[1]-im.height)//2))
d.text((35,15),'REFERENCE CONCEPT',fill='#f0dfbf');d.text((930,15),'EDITABLE 3D RECONSTRUCTION / REFERENCE RIG ANGLE',fill='#f0dfbf')
put(ref.crop((245,18,955,490)),(20,45,890,650))
put(Image.open(root/'reference-final-broadside.png').crop((45,100,1390,930)),(915,45,1785,650))
for idx,(name,rc) in enumerate([('bow',(1025,18,1245,490)),('stern',(1300,25,1510,490))]):
 x=idx*450
 d.text((x+40,680),name.upper()+' / CONCEPT',fill='#f0dfbf');d.text((x+940,680),name.upper()+' / 3D',fill='#f0dfbf')
 put(ref.crop(rc),(x+20,710,x+430,1270))
 put(Image.open(root/('reference-final-'+name+'-full.png')).crop((415,45,990,985)),(x+920,710,x+1330,1270))
d.text((35,1300),'DECK / CONCEPT',fill='#f0dfbf');d.text((935,1300),'DECK / 3D',fill='#f0dfbf')
put(ref.crop((112,550,744,710)),(20,1330,890,1560))
put(Image.open(root/'reference-final-overhead.png').crop((0,305,1390,685)),(915,1330,1785,1560))
d.text((35,1590),'Latest game version turns square sails forward at user request; this sheet preserves the concept-angle comparison.',fill='#f0dfbf')
out.save(root/'reference-comparison.png')
