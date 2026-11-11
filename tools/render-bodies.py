"""Bake original rotating body materials. Only needed when changing the artwork."""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree

OUTPUT = Path(__file__).resolve().parents[1] / 'assets'
TILE, FRAMES, COLUMNS = 160, 48, 8
rng = np.random.default_rng(7146)
noise_volume = rng.uniform(-1, 1, (64, 64, 64)).astype('f')
TAU = 2 * np.pi


def noise(x, y, z, scale):
    coords = np.stack(np.broadcast_arrays(x * scale + 7, y * scale + 13, z * scale + 21))
    return map_coordinates(noise_volume, coords, order=1, mode='grid-wrap')


def color_ramp(v, knots, colors):
    return np.stack([np.interp(v, knots, np.array(colors)[:, k]) for k in range(3)], axis=-1)


def rgba(rgb, alpha):
    return Image.fromarray(np.uint8(np.clip(np.dstack((rgb, alpha * 255)), 0, 255)))


# Generate materials on a sphere so there is no seam at the meridian.
lat, lon = np.mgrid[-np.pi/2:np.pi/2:512j, -np.pi:np.pi:1024j]
X, Y, Z = np.cos(lat)*np.sin(lon), np.sin(lat), np.cos(lat)*np.cos(lon)
rough = noise(X,Y,Z,9)*.6 + noise(X,Y,Z,22)*.32 + noise(X,Y,Z,65)*.2
fine = noise(X,Y,Z,105)
storm_x = np.arctan2(np.sin(lon-.55), np.cos(lon-.55))/.55
storm_y = (lat-.23)/.14
storm = np.hypot(storm_x,storm_y)
warp = lat+.022*np.sin(lon*5+lat*15)+rough*.041
bands = (.42*np.sin(17*warp)+.19*np.sin(51*warp+np.sin(lon*3))+.15*np.sin(85*warp)+rough*.45)
bands += np.exp(-storm**2*1.1)*(.8*np.cos(storm*14+rough*1.8)-.25)
planet = color_ramp(bands,[-1,-.55,-.22,.02,.3,.65,1],
    [[56,72,85],[88,111,128],[155,172,175],[216,208,180],[170,139,113],[113,96,93],[183,163,139]])

cells = rng.normal(size=(6500,3))
cells /= np.linalg.norm(cells,axis=1)[:,None]
dist,_ = cKDTree(cells).query(np.stack((X,Y,Z),axis=-1),k=2)
granule = np.clip((dist[:,:,1]-dist[:,:,0])*85,0,1)
activity = noise(X,Y,Z,3)*.35 + rough*.42 + granule*.32 + fine*.1
spots = np.clip((noise(X,Y,Z,6)+.3*rough-.50)*3.2,0,1)
star = color_ramp(activity-spots*.78,[-1,-.4,-.08,.25,.52,.85],
    [[65,33,19],[158,65,27],[225,117,47],[255,174,75],[255,209,132],[255,232,184]])

elevation = .17*noise(X,Y,Z,3)+rough*.19+fine*.045
for _ in range(95):
    center = rng.normal(size=3)
    center /= np.linalg.norm(center)
    radius = rng.uniform(.024,.19)
    d = np.sqrt(np.maximum(0,2*(1-X*center[0]-Y*center[1]-Z*center[2])))/radius
    elevation += radius*(.35*np.exp(-((d-1)/.18)**2) - .86*np.exp(-(d/.78)**4))
rock = color_ramp(elevation+fine*.06,[-.39,-.16,.01,.18,.32],
    [[64,58,54],[111,100,91],[150,140,124],[183,172,153],[207,200,180]])
neutron = color_ramp(rough*.36+.28*np.sin(lon*3+lat*5+rough*2),
    [-1,-.3,0,.3,1],[[72,115,158],[145,193,225],[192,225,247],[213,238,248],[242,250,255]])


continents=noise(X,Y,Z,2.6)+.34*noise(X,Y,Z,7)+.16*rough
clouds=np.clip((noise(X+rough*.08,Y,Z,9)+.22*np.sin(lat*33+lon*3)-.18)*1.75,0,.87)
ocean=color_ramp(continents,[-1,-.18,.00,.04,.27,.62,1],[[10,40,74],[16,66,103],[38,123,143],[165,157,109],[75,107,72],[128,111,78],[174,158,127]])
ocean=ocean*(1-clouds[:,:,None])+clouds[:,:,None]*[233,239,236]
desert=color_ramp(continents+.3*rough+.09*np.sin(lat*63+rough*6),[-1,-.5,0,.4,1],[[91,50,40],[148,71,41],[202,117,67],[234,169,104],[239,206,150]])
giant=color_ramp(noise(X,Y,Z,5)*.62+rough*.44+granule*.16,[-1,-.4,0,.4,1],[[80,12,9],[142,35,14],[218,74,25],[255,136,53],[255,197,116]])
flare=color_ramp(activity-spots*.8,[-1,-.3,0,.4,.8],[[71,35,62],[165,98,67],[236,166,108],[255,215,161],[255,245,209]])
magnetar=color_ramp(rough*.35+np.sin(7*lat+lon*2+.8*rough)*.38,[-1,-.35,.1,.4,.9],[[49,43,99],[91,91,159],[147,173,218],[202,216,248],[255,235,251]])
def sample(material, latitude, longitude):
    ix = np.mod((longitude+np.pi)/TAU,1)*(material.shape[1]-1)
    iy = np.clip((latitude/np.pi+.5)*(material.shape[0]-1),0,material.shape[0]-1)
    if material.ndim==2:
        return map_coordinates(material,[iy,ix],order=1,mode='nearest')
    return np.stack([map_coordinates(material[:,:,k],[iy,ix],order=1,mode='nearest') for k in range(3)],axis=-1)


def surface(kind, phase):
    y,x = (np.indices((TILE,TILE))+.5-TILE/2)/(TILE*.45)
    if kind=='asteroid':
        phi=np.arctan2(y/.78,x)
        outline=1+.087*np.cos(phi*3+phase)+.05*np.sin(phi*5-phase)+.035*np.cos(phi*8+phase)
        x=x/(outline*.94)
        y=y/(outline*.76)
    radial=np.hypot(x,y)
    z=np.sqrt(np.maximum(0,1-radial**2))
    latitude=np.arcsin(np.clip(y,-1,1))
    longitude=np.arctan2(x,z)+phase
    material={'ocean':ocean,'desert':desert,'giant':giant,'flare':flare,'magnetar':magnetar,'planet':planet,'star':star,'asteroid':rock,'neutron':neutron}[kind]
    rgb=sample(material,latitude,longitude)
    if kind in ('star','giant','flare'):
        lighting=.58+.42*z**.68
    elif kind in ('neutron','magnetar'):
        poles=np.abs(np.sin(latitude)*.75+np.cos(latitude)*np.cos(longitude)*.661)
        rgb+=np.exp(-((1-poles)/.033)**2)[:,:,None]*[55,49,33]
        lighting=.48+.52*z**.57
    else:
        light=-.76*x-.34*y+.55*z
        if kind=='asteroid':
            height=sample(elevation,latitude,longitude)
            dy,dx=np.gradient(height)
            light-=np.clip(-dx*10-dy*5,-.52,.52)
        lighting=.12+.94*np.maximum(0,light)**.78+.04*np.maximum(0,z)
        if kind=='planet':
            rgb+=np.maximum(0,light)[:,:,None]*(1-z[:,:,None])**4*[54,77,92]
    alpha=np.clip((1-radial)*TILE*.45+.5,0,1)
    return rgba(rgb*lighting[:,:,None],alpha)


def blackhole(phase):
    y,x=(np.indices((TILE,TILE))+.5-TILE/2)/(TILE*.185)
    r=np.hypot(x,y)
    equator=y-.10
    disk=np.hypot(x,equator/.18)
    phi=np.arctan2(equator/.18,x)
    lanes=.73+.16*np.sin(disk*49+.60*np.sin(phi*4-phase))+.12*np.sin(disk*21+np.sin(phi*3+phase))
    falloff=np.exp(-np.maximum(0,disk-1.02)*1.85)*np.clip((disk-.89)*10,0,1)
    disk_light=falloff*lanes*np.where((equator<0)&(r<.94),0,1)
    radius=np.sqrt(x*x+(y/.97)**2)
    arch=np.exp(-((radius-1.05)/.115)**2)*np.where(y<0,1,.4)
    arch*=.8+.2*np.sin(radius*110+.9*np.sin(np.arctan2(y,x)*5-phase))
    thin=np.exp(-((r-.94)/.026)**2)*.54
    emission=(disk_light*1.4+arch*.86+thin)*(.88-.3*np.clip(x,-1,1))
    rgb=color_ramp(emission,[0,.06,.2,.42,.78,1.2,1.7],
        [[30,15,14],[92,39,29],[165,65,32],[222,116,52],[251,175,96],[255,218,159],[255,242,211]])
    alpha=np.clip(emission*5,0,1)*np.clip((2.67-disk)*4,0,1)
    alpha=np.maximum(alpha,np.clip(arch*4+thin*4,0,1))
    shadow=r<.94
    alpha=np.where(shadow,1,alpha)
    rgb=np.where((shadow & (emission<.008))[:,:,None],[3,5,9],rgb)
    return rgba(rgb,alpha)


for kind in ('planet','star','asteroid','neutron','blackhole'):
    atlas=Image.new('RGBA',(COLUMNS*TILE, FRAMES//COLUMNS*TILE))
    for i in range(FRAMES):
        phase=TAU*i/FRAMES
        frame=blackhole(phase) if kind=='blackhole' else surface(kind,phase)
        atlas.paste(frame,((i%COLUMNS)*TILE,(i//COLUMNS)*TILE))
    atlas.save(OUTPUT/('body-'+kind+'.webp'),quality=89,method=4)


# Static optically thin light around the rotating solid surfaces.
y,x=(np.indices((384,512))+.5-np.array([192,256])[:,None,None])/49
layers=Image.new('RGBA',(512,3*384))
s=np.maximum(0,-x)
gate=np.clip((s-.10)*3,0,1)*np.clip((4.95-s)/.85,0,1)**2
dust_center=.052*s**1.85
dust_width=.16+.091*s
dust=np.exp(-((y-dust_center)/dust_width)**2)*np.exp(-s*.57)*gate
ion=np.exp(-((y+.08*s)/(.043+.017*s))**2)*np.exp(-s*.61)*gate
streaks=.78+.22*noise(s*.25,y*2,s*0,3)
alpha=np.clip(.86*dust*streaks+.53*ion,0,1)
mix=ion/(dust+ion+1e-5)
rgb=np.array([212,203,176])+(np.array([133,197,234])-np.array([212,203,176]))*mix[:,:,None]
layers.paste(rgba(rgb,alpha),(0,0))

axis=np.abs(y)
w=.072+.044*axis
fade=np.exp(-np.maximum(0,axis-.5)*1.55)*np.clip((2.70-axis)/.6,0,1)
beam=fade*np.exp(-((x-.018*np.sin(y*4))/w)**2)
haze=.27*fade*np.exp(-(x/(w*3))**2)
layers.paste(rgba(color_ramp(beam,[0,.3,.82,1],[[103,149,195],[141,194,226],[202,232,248],[233,246,255]]),np.clip(haze+beam,0,1)),(0,384))

r=np.hypot(x,y)
phi=np.arctan2(y,x)
stream=.62+.25*np.sin(phi*15+np.sin(phi*8))+.13*np.cos(phi*32)
corona=np.exp(-np.maximum(0,r-.98)*9)*stream*np.clip((1.6-r)*5,0,1)
for center,width,high in [(-2.3,.15,.13),(-.4,.10,.09),(1.8,.08,.07)]:
    d=np.arctan2(np.sin(phi-center),np.cos(phi-center))/width
    loop=np.exp(-((r-1-high*np.sqrt(np.maximum(0,1-d*d)))/.012)**2)*np.clip((1-np.abs(d))*10,0,1)
    corona+=loop*.72
layers.paste(rgba(color_ramp(corona,[0,.5,1],[[195,87,40],[237,119,47],[255,184,98]]),np.clip(corona,0,1)),(0,768))
layers.save(OUTPUT/'body-emission.webp',quality=91,method=4)

# Load close-up frames individually to bound decoded texture memory.
TILE=640
for kind in ('blackhole','vortex','star','giant','flare','neutron','magnetar','planet','ocean','desert','asteroid'):
    low=Image.new('RGBA',(8*160,2*160))
    for i in range(16):
        phase=i*TAU/16
        frame=blackhole(phase) if kind in ('blackhole','vortex') else surface(kind,phase)
        if kind=='vortex':
            arr=np.array(frame)
            light=arr[:,:,0].astype(float)/255
            arr[:,:,:3]=color_ramp(light,[0,.32,.7,1],[[3,5,10],[39,52,95],[96,140,204],[209,237,255]])
            frame=Image.fromarray(arr).rotate(28,resample=Image.Resampling.BICUBIC)
        frame.save(OUTPUT/f'near-{kind}-{i}.webp',quality=92,method=2)
        low.paste(frame.resize((160,160),Image.Resampling.LANCZOS),(i%8*160,i//8*160))
    if kind in ('vortex','giant','flare','magnetar','ocean','desert'):
        low.save(OUTPUT/f'body-{kind}.webp',quality=89)
