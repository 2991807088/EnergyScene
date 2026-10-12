// ============================================================
//  交通信号相位（红绿灯 + 汽车共用同一套时间基准）
//  相位循环：NS 绿 → NS 黄 → EW 绿 → EW 黄 → 循环
//  NS = 南北向（沿 z 轴行驶的车），EW = 东西向（沿 x 轴行驶的车）
// ============================================================

export const GREEN_TIME = 4.5
export const YELLOW_TIME = 1.5
export const CYCLE = 2 * (GREEN_TIME + YELLOW_TIME) // 12s

/**
 * 根据累计时间 t 求当前信号。
 * @returns {{ ns: 'green'|'yellow'|'red', ew: 'green'|'yellow'|'red', remain: number }}
 *          remain 为「当前灯色的剩余秒数」
 */
export function signalAt(t) {
  const x = ((t % CYCLE) + CYCLE) % CYCLE
  const g = GREEN_TIME
  const y = YELLOW_TIME

  if (x < g) return { ns: 'green', ew: 'red', remain: g - x }
  if (x < g + y) return { ns: 'yellow', ew: 'red', remain: g + y - x }
  if (x < 2 * g + y) return { ns: 'red', ew: 'green', remain: 2 * g + y - x }
  return { ns: 'red', ew: 'yellow', remain: CYCLE - x }
}

/** 灯色 → 自发光强度（亮 / 灭） */
export function intensityFor(state, color) {
  return state === color ? 2.6 : 0.1
}
