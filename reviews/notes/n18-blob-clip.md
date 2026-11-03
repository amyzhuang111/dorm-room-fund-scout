# n18 blob clip fix

Hard rectangular clipping on mid blobs (upper-left) from contour textures reaching sprite edges.

## Fix
- Contour grid 256px; world extent padded (`padFrac` 0.20 soft / 0.14 deep) past cluster
- Smoothstep fade of alpha to 0 before each texture edge; force outer 2px alpha=0
- `assertBlobTextureBorderClear` at build; runtime `__NETWORKS_BLOB_CANVASES__` recheck
- ClampToEdgeWrapping on textures

## Verify
- Border alpha=0 on 56 soft+deep textures (1440 + 375)
- Shots: `/workspace/reviews/shots/campus-scout/n18-blob-clip/` (all zooms × 1440/375 + 3 mid rotations)
- No page errors; change is encodings + tiny graph stash only

## Shots / preview
- sha: `78045e5730415576817a480fd20289b9e0e0d9ea`
- preview: https://campus-scout-7woqrzlus-amys-projects-d3dfb125.vercel.app
