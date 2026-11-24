"""Build checked, deduplicated cards from the six scanned worksheet pages.
Run after rendering high-N.png at 3200px and placing reviewed meta-N.json in tmp/pdfs.
Answers remain scans: no OCR replaces a character or a tone mark.
"""
import json, hashlib, math
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
ROOT=Path(__file__).resolve().parent.parent
TMP=ROOT/'tmp/pdfs'; OUT=ROOT/'assets/cards'; OUT.mkdir(parents=True,exist_ok=True)
# Worksheet grid lines, left to right. Small perspective changes are retained per row.
BASE={
1:[[194,285,377,467,560,650,741,832,923,1012,1101,1190,1278,1366,1455,1542,1630,1718,1805,1892,1980,2068,2155,2242,2331,2420],[197,289,383,474,566,657,748,839,929,1019,1107,1196,1283,1371,1459,1546,1633,1720,1806,1893,1980,2068,2154,2241,2329,2417],[203,294,387,478,570,660,751,842,932,1022,1110,1198,1285,1373,1461,1548,1634,1721,1807,1893,1980,2068,2154,2241,2328,2417],[207,297,388,478,569,659,750,840,930,1020,1108,1197,1285,1373,1461,1548,1635,1723,1809,1896,1983,2070,2157,2244,2332,2421]],
2:[[202,293,386,478,570,660,751,842,933,1022,1111,1200,1287,1376,1464,1551,1639,1727,1814,1902,1990,2078,2166,2254,2342,2433],[208,300,392,484,576,667,758,848,937,1027,1116,1204,1292,1380,1468,1556,1643,1730,1817,1905,1993,2080,2168,2256,2344,2433],[212,304,396,488,579,670,761,851,941,1030,1119,1208,1296,1384,1472,1559,1647,1734,1822,1909,1997,2085,2173,2261,2349,2438],[213,304,395,486,577,668,759,849,939,1029,1118,1207,1295,1383,1471,1559,1647,1735,1823,1911,1999,2087,2175,2263,2351,2439]],
3:[[218,310,402,493,584,674,765,855,944,1033,1121,1209,1296,1383,1471,1558,1645,1733,1819,1906,1994,2081,2169,2256,2344,2432],[226,318,410,501,592,682,771,861,950,1037,1126,1213,1299,1386,1474,1559,1646,1733,1819,1906,1993,2081,2167,2254,2342,2430],[229,321,414,503,593,683,773,862,952,1039,1127,1214,1301,1388,1475,1561,1647,1734,1820,1906,1994,2081,2168,2255,2343,2432],[228,318,410,500,590,680,770,860,950,1038,1126,1213,1300,1388,1476,1562,1649,1736,1823,1909,1997,2084,2172,2259,2348,2437]],
4:[[219,310,402,493,584,676,767,858,948,1038,1128,1216,1304,1393,1480,1567,1654,1740,1827,1914,2000,2087,2174,2260,2347,2434],[226,318,409,501,593,684,774,865,954,1043,1133,1221,1309,1397,1484,1570,1657,1743,1829,1915,2001,2087,2173,2259,2346,2433],[230,321,412,503,593,684,775,866,956,1044,1134,1222,1310,1398,1485,1572,1659,1745,1830,1916,2002,2089,2175,2261,2347,2434],[231,321,411,501,592,681,771,863,953,1042,1132,1220,1308,1398,1485,1572,1659,1745,1832,1918,2004,2091,2178,2264,2352,2438]],
5:[[214,305,395,486,576,666,756,846,935,1023,1113,1201,1289,1377,1464,1551,1638,1725,1812,1899,1986,2073,2160,2248,2336,2424],[222,313,403,494,585,674,764,853,942,1030,1118,1206,1293,1380,1467,1554,1640,1726,1812,1898,1985,2072,2158,2245,2333,2420],[228,319,409,497,587,676,766,855,944,1032,1120,1207,1294,1381,1468,1554,1640,1726,1812,1898,1984,2071,2158,2245,2332,2419],[230,318,407,496,585,674,763,852,941,1029,1118,1206,1293,1380,1467,1554,1640,1726,1812,1898,1985,2072,2159,2246,2333,2420]],
6:[[204,294,384,474,563,653,743,832,921,1010,1100,1187,1275,1364,1451,1539,1626,1713,1801,1888,1976,2064,2152,2240,2329,2418],[210,300,390,480,570,660,750,840,929,1018,1106,1194,1282,1370,1457,1544,1631,1718,1805,1892,1980,2067,2155,2242,2331,2421],[213,303,392,482,572,662,752,842,932,1021,1110,1198,1286,1374,1462,1549,1636,1723,1810,1897,1985,2073,2160,2248,2337,2426],[214,303,391,480,569,659,749,840,930,1021,1110,1199,1287,1376,1464,1551,1639,1727,1815,1903,1991,2079,2168,2257,2346,2436]]}
BANDS={1:[(281,335),(738,793),(1185,1249),(1636,1708)],2:[(258,306),(722,765),(1172,1221),(1630,1684)],3:[(274,328),(718,771),(1150,1212),(1590,1658)],4:[(265,328),(722,780),(1172,1227),(1618,1680)],5:[(258,313),(713,768),(1166,1216),(1614,1670)],6:[(266,317),(715,765),(1162,1214),(1608,1666)]}
cards=[]; bykey={}; all_meta=[]; crop_checks=[]
for page in range(1,7):
 im=Image.open(TMP/f'high-upright-{page}.png').convert('RGB'); a=np.array(im).astype('int16');r,g,b=a[:,:,0],a[:,:,1],a[:,:,2]
 # Remove the uneven purple cast of the scan using a local paper estimate.
 bg=np.array(Image.fromarray(r.astype('uint8')).filter(ImageFilter.GaussianBlur(12))).astype('int16')
 blue=np.clip((bg-r-3)*13,0,255)*((b-r>7)&(b-g>0))
 meta=json.loads((TMP/f'meta-{page}.json').read_text())
 assert len(meta)==100 and [x['number'] for x in meta]==list(range(1,101))
 for item in meta:
  num=item['number'];row=(num-1)//25;col=24-(num-1)%25
  indices=item.get('targetIndices',[item['targetIndex']]);target=item.get('target',item.get('answer'));kind='shape' if page<=3 else 'sound'
  assert item.get('bopomofo'), ('Missing pronunciation',page,num)
  assert all(item['word'][i]==target for i in indices),(page,num,item)
  key=json.dumps([kind,item['word'],target,indices],ensure_ascii=False)
  source={'page':page,'number':num,'year':[114,113,112,114,113,112][page-1]}
  all_meta.append({**item,'kind':kind,**source})
  if key in bykey:
   assert bykey[key].get('bopomofo')==item.get('bopomofo'), ('Conflicting pronunciation',page,num,item['word'])
   bykey[key]['sources'].append(source);continue
  cid=f'{kind}-{hashlib.sha256(key.encode()).hexdigest()[:12]}'
  left,right=BASE[page][row][col:col+2];yl,yh=BANDS[page][row]
  # Keep source crops as photographs. The interactive card uses verified large text.
  # Do not isolate colored strokes or split individual glyphs: both can alter a tone mark.
  answer=im.crop((left+5,yl-15,right-5,yh+16))
  answer.save(OUT/f'{cid}-answer.png',optimize=True)
  yrange=(yh+3,yh+56)
  line_scores=blue[yrange[0]:yrange[1],left+8:right-8].sum(1)
  boundary=yrange[0]+int(line_scores.argmax())
  if line_scores.max()<4500: boundary=yh+23
  y0=boundary+10
  y1=min(y0+len(item['word'])*64+12,(BANDS[page][row+1][0]-110) if row<3 else im.height-120)
  prompt=im.crop((left+5,y0,right-5,y1))
  prompt.save(OUT/f'{cid}-prompt.png',optimize=True)
  height=prompt.height;parts=len(item['word'])
  raw=im.crop((left+3,yl-20,right-3,y1));raw.save(OUT/f'{cid}-source.webp',quality=92)
  card={'id':cid,'kind':kind,'word':item['word'],'target':target,'targetIndex':item['targetIndex'],'targetIndices':indices,'prompt':f'assets/cards/{cid}-prompt.png','answerImage':f'assets/cards/{cid}-answer.png','sourceImage':f'assets/cards/{cid}-source.webp','sources':[source]}
  if item.get('note'): card['note']=item['note']
  if item.get('bopomofo'): card['bopomofo']=item['bopomofo']
  cards.append(card);bykey[key]=card
  crop_checks.append({'id':cid,'page':page,'number':num,'y0':y0,'boundary':boundary,'inkHeight':height,'wordLength':parts})
 report={'original':600,'unique':len(cards),'removed':600-len(cards),'shape':sum(c['kind']=='shape' for c in cards),'sound':sum(c['kind']=='sound' for c in cards),'duplicates':[{'word':c['word'],'kind':c['kind'],'target':c['target'],'sources':c['sources']} for c in cards if len(c['sources'])>1]}
(ROOT/'deck.json').write_text(json.dumps({'version':1,'examDate':'2026-12-03','summary':report,'cards':cards},ensure_ascii=False,separators=(',',':')))
(ROOT/'data').mkdir(exist_ok=True)
(ROOT/'data/source-metadata.json').write_text(json.dumps(all_meta,ensure_ascii=False,indent=2))
(ROOT/'data/deduplication.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(TMP/'crop-checks.json').write_text(json.dumps(crop_checks,indent=2))
# Contact sheets, each tile with source number, readable word prompt, and answer.
for page in range(1,7):
 pc=[c for c in cards if c['sources'][0]['page']==page]
 for offset in range(0,len(pc),25):
  chunk=pc[offset:offset+25];sheet=Image.new('RGB',(1500,math.ceil(len(chunk)/5)*350),'white');draw=ImageDraw.Draw(sheet)
  for j,c in enumerate(chunk):
   x=(j%5)*300;y=(j//5)*350;draw.text((x+10,y+6),f"p{page} #{c['sources'][0]['number']} {c['id']}",fill='black')
   q=Image.open(ROOT/c['sourceImage']);q.thumbnail((150,315));sheet.paste(q,(x+75,y+27))
   draw.rectangle((x,y,x+299,y+349),outline='#cccccc')
  sheet.save(TMP/f'qa-source-{page}-{offset//25+1}.jpg',quality=92)
# App icons are drawn geometrically, with the same strokes as icon.svg.
for size in [192,512]:
 icon=Image.new('RGB',(size,size),'#17695c');d=ImageDraw.Draw(icon);s=size/192
 def line(points):d.line([(int(x*s),int(y*s)) for x,y in points],fill='white',width=int(10*s),joint='curve')
 for pts in [[(96,35),(96,47)],[(48,68),(48,52),(144,52),(144,68)],[(64,83),(128,83),(96,105),(96,144),(90,153),(73,153)],[(49,117),(144,117)]]:line(pts)
 d.ellipse((147*s,28*s,161*s,42*s),fill='#f1c36b');icon.save(ROOT/f'assets/icon-{size}.png')
print(json.dumps({k:v for k,v in report.items() if k!='duplicates'},ensure_ascii=False))
