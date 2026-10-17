// position 为相机位置，target 为观察中心；全部视角仍由 OrbitControls 自由操作。
export const CAMERA_VIEWS = [
  { key: 'overview', label: '城市全景', position: [500, 350, 450], target: [100, 0, 0] },
  { key: 'north', label: '北侧远眺', position: [-450, 300, -450], target: [0, 0, 60] },
  { key: 'overhead', label: '城市俯瞰', position: [70, 780, 160], target: [70, 0, 120] },
  // 塔尖最高约 112，相机略高于塔尖，沿城市南侧向外俯瞰。
  { key: 'pearl', label: '东方明珠塔顶', position: [-14, 114, -64], target: [-64, 0, 200] },
  { key: 'mall', label: '太古里街区', position: [8, 72, 155], target: [-64, 0, 64] },
  { key: 'solar', label: '光伏电站', position: [490, 130, -50], target: [401, 0, 101] },
  { key: 'wind', label: '山间风电', position: [-70, 150, -400], target: [-210, 20, -250] },
  { key: 'thermal', label: '火力发电厂', position: [540, 140, 340], target: [401, 12, 221] },
  { key: 'hydro', label: '长江水电站', position: [-210, 100, 200], target: [-330, 0, 62] }
]
