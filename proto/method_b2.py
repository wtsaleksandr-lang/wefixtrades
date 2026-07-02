import cv2, numpy as np
ARCH='../server/roofQuote/assets/showroom/arch__weathered-wood.jpg'
MASK='../scripts/showroom-assets/mask.png'; TILE='arch_tile_final.png'
arch=cv2.imread(ARCH).astype(np.float32); H,W=arch.shape[:2]
maskbin=(cv2.cvtColor(cv2.imread(MASK),cv2.COLOR_BGR2GRAY)>127).astype(np.uint8)
tile=cv2.imread(TILE).astype(np.float32); tH,tW=tile.shape[:2]
# tile at a scale giving large-ish tabs over roof width (~1036px roof, ~2.2 reps)
scale=(1036/2.2)/tW
ts=cv2.resize(tile,(int(tW*scale),int(tH*scale)),interpolation=cv2.INTER_AREA)
tiled=np.tile(ts,(int(np.ceil(H/ts.shape[0])),int(np.ceil(W/ts.shape[1])),1))[:H,:W]
tg=cv2.cvtColor(np.clip(tiled,0,255).astype(np.uint8),cv2.COLOR_BGR2GRAY).astype(np.float32)
detail=tg-cv2.GaussianBlur(tg,(0,0),4.0)
detail=detail/(detail.std()+1e-6)
lab=cv2.cvtColor(np.clip(arch,0,255).astype(np.uint8),cv2.COLOR_BGR2LAB).astype(np.float32)
lab[:,:,0]=np.clip(lab[:,:,0]+20.0*detail,0,255)
out=cv2.cvtColor(lab.astype(np.uint8),cv2.COLOR_LAB2BGR).astype(np.float32)
m3=(maskbin>0)[...,None]
res=np.where(m3,np.clip(out,0,255),arch)
print('outsideMax:',float(np.abs((res-arch)[maskbin==0]).max()))
cv2.imwrite('methodB.jpg',res.astype(np.uint8),[cv2.IMWRITE_JPEG_QUALITY,95])
crop=res[275:365,330:730].astype(np.uint8)
cv2.imwrite('methodB_zoom.png',cv2.resize(crop,(crop.shape[1]*3,crop.shape[0]*3),interpolation=cv2.INTER_NEAREST))
print('done')
