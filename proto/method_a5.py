import cv2, numpy as np
ARCH='../server/roofQuote/assets/showroom/arch__weathered-wood.jpg'
MASK='../scripts/showroom-assets/mask.png'; TILE="arch_tile_joints.png"
arch=cv2.imread(ARCH).astype(np.float32); H,W=arch.shape[:2]
maskbin=(cv2.cvtColor(cv2.imread(MASK),cv2.COLOR_BGR2GRAY)>127).astype(np.uint8)
tile=cv2.imread(TILE).astype(np.float32); tH,tW=tile.shape[:2]

def tiled_source(dw,dh,reps_x):
    s=(dw/reps_x)/tW; th=max(1,int(round(tH*s))); tw=max(1,int(round(tW*s)))
    ts=cv2.resize(tile,(tw,th),interpolation=cv2.INTER_AREA)
    return np.tile(ts,(int(np.ceil(dh/th)),int(np.ceil(dw/tw)),1))[:dh,:dw]

def map_plane(quad,reps_x,courses):
    q=np.array(quad,np.float32)
    sw=int(max(np.linalg.norm(q[1]-q[0]),np.linalg.norm(q[2]-q[3]),4))
    sh=int(max(4,sw/reps_x*(tH/tW)*courses))
    src=tiled_source(sw,sh,reps_x)
    Hm=cv2.getPerspectiveTransform(np.array([[0,0],[sw,0],[sw,sh],[0,sh]],np.float32),q)
    w=cv2.warpPerspective(src,Hm,(W,H),flags=cv2.INTER_AREA,borderMode=cv2.BORDER_REFLECT)
    pm=np.zeros((H,W),np.uint8); cv2.fillConvexPoly(pm,q.astype(np.int32),1)
    return w,pm

planes=[
 map_plane([[490,291],[1036,289],[849,403],[413,400]],1.35,9),
 map_plane([[251,282],[330,317],[452,400],[300,352]],0.45,5),
 map_plane([[950,334],[1037,289],[1128,402],[1006,331]],0.5,5),
]
shingle=np.zeros_like(arch); cov=np.zeros((H,W),np.float32)
for w,pm in planes:
    f=pm.astype(np.float32); shingle=shingle*(1-f[...,None])+w*f[...,None]; cov=np.maximum(cov,f)
fb=tiled_source(W,H,2.0); need=(maskbin>0)&(cov<0.5); shingle[need]=fb[need]

# GENTLE lighting: multiply by BROAD (smoothed) luminance ratio only -> keeps AI shading, no streaks
alum=cv2.cvtColor(np.clip(arch,0,255).astype(np.uint8),cv2.COLOR_BGR2GRAY).astype(np.float32)
alum_s=cv2.GaussianBlur(alum,(0,0),8)   # broad only
rm=alum_s[maskbin>0].mean()
lum=np.clip(alum_s/(rm+1e-6),0.55,1.5)
sl=shingle*lum[...,None]
# color match to arch tone
sm=sl[maskbin>0].mean(0); am=arch[maskbin>0].mean(0); sl=sl*(am/(sm+1e-6))
# NO clahe, NO high blend-back. tiny broad-color nudge for valley/ridge shading:
ab=cv2.GaussianBlur(arch,(0,0),20); sb=cv2.GaussianBlur(sl,(0,0),20)
sf=sl+(ab-sb)*0.30
m3=(maskbin>0)[...,None]
res=np.where(m3,np.clip(sf,0,255),arch)
print('outsideMax:',float(np.abs((res-arch)[maskbin==0]).max()))
cv2.imwrite('methodA.jpg',res.astype(np.uint8),[cv2.IMWRITE_JPEG_QUALITY,95])
crop=res[275:365,330:730].astype(np.uint8)
cv2.imwrite('methodA_zoom.png',cv2.resize(crop,(crop.shape[1]*3,crop.shape[0]*3),interpolation=cv2.INTER_NEAREST))
print('done')
