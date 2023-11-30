import { BufferAttribute, BufferGeometry } from "three"

function recalculateUVs(position: Float32Array, bboxLocal: [number, number][]) {
  const offset_x = -bboxLocal[0][0]
  const offset_y = -bboxLocal[0][1]
  const width = bboxLocal[1][0] - bboxLocal[0][0]
  const height = bboxLocal[1][1] - bboxLocal[0][1]

  const newUvs = new Array((2 * position.length) / 3)
  for (let i = 0; i < position.length / 3; i++) {
    newUvs[2 * i] = (position[3 * i] + offset_x) / width
    newUvs[2 * i + 1] = 1 - (position[3 * i + 1] + offset_y) / height
  }
  return new Float32Array(newUvs)
}

export function repair(bbox: [number, number][], geometry: BufferGeometry) {
  const uvs = recalculateUVs(
    geometry.attributes.position.array as Float32Array,
    bbox,
  )
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2))
}
