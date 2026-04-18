import { useAppStore } from '@/lib/store/app-store'

const en = {
  shell: {
    eyebrow: 'US equity autopilot',
    tabs: {
      cockpit: 'Trading Cockpit',
      candidates: 'Candidates',
      orders: 'Orders & Positions',
      settings: 'Settings',
    },
    mode: {
      paper: 'Paper',
      live: 'Live',
    },
    labels: {
      autopilot: 'Autopilot',
      provider: 'Provider',
      liveGate: 'Live gate',
      whitelist: 'Whitelist',
      updated: 'Updated',
    },
  },
  pages: {
    cockpit: {
      title: 'Trading Cockpit',
      description:
        'Monitor mode state, capital, exposure, live promotion readiness, and the latest decision cycle from one operator surface.',
    },
    candidates: {
      title: 'Candidates',
      description:
        'Track the deterministic scan, AI ranking, and hard risk verdict for each symbol before any order can route.',
    },
    orders: {
      title: 'Orders & Positions',
      description:
        'Keep filled orders, current positions, and recent decision cycles tied together for replay and review.',
    },
    settings: {
      title: 'Stocks Settings',
      description:
        'Configure whitelist, default mode, risk caps, and operator safeguards without mixing them into the RWA settings surface.',
    },
  },
  actions: {
    arm: 'Arm autopilot',
    run: 'Start running',
    pause: 'Pause',
    halt: 'Kill switch',
    save: 'Save settings',
    refresh: 'Refresh',
    retry: 'Retry',
  },
  sections: {
    capital: 'Capital and state',
    guardrails: 'Guardrails',
    providers: 'Providers',
    promotionGate: 'Promotion gate',
    positions: 'Open positions',
    latestCycle: 'Latest decision cycle',
    candidateStream: 'Candidate stream',
    aiVerdict: 'AI and risk verdict',
    orderLog: 'Order log',
    cycleReplay: 'Decision replay',
    notifications: 'Notifications',
    riskLimits: 'Risk limits',
    providerReadiness: 'Provider readiness',
  },
  metrics: {
    equity: 'Equity',
    buyingPower: 'Buying power',
    dayPnl: 'Day PnL',
    grossExposure: 'Gross exposure',
    openPositions: 'Open positions',
    candidates: 'Candidates',
    approved: 'Approved',
    watchOnly: 'Watch only',
    bestScore: 'Best score',
    paperDays: 'Paper days',
    fillRate: 'Fill rate',
    maxDrawdown: 'Max drawdown',
    unresolved: 'Unresolved orders',
  },
  fields: {
    defaultMode: 'Default mode',
    notifications: 'Notifications',
    whitelist: 'Whitelist tickers',
    singleCap: 'Single position cap (%)',
    grossCap: 'Gross exposure cap (%)',
    dailyLoss: 'Daily loss stop (%)',
    maxPositions: 'Max open positions',
    maxEntries: 'Max new entries per symbol / day',
    tradingWindow: 'Trading window (ET)',
    extendedHours: 'Allow extended hours',
    marketableLimit: 'Use marketable limit orders',
  },
  values: {
    enabled: 'Enabled',
    disabled: 'Disabled',
    yes: 'Yes',
    no: 'No',
  },
  states: {
    approved: 'Approved',
    blocked: 'Blocked',
    watchOnly: 'Watch only',
    connected: 'Connected',
    simulated: 'Simulated',
    unavailable: 'Unavailable',
    paused: 'Paused',
    armed: 'Armed',
    running: 'Running',
    halted: 'Halted',
  },
  empty: {
    positions: 'No open position yet in this mode.',
    orders: 'No routed order yet in this mode.',
    candidates: 'No candidate scan has been generated yet.',
  },
  messages: {
    settingsSaved: 'Stocks settings saved.',
    stateUpdated: 'Autopilot state updated.',
    killSwitch: 'Kill switch activated.',
    paperOnly: 'Live mode can only arm after the promotion gate passes.',
    whitelistHint: 'Comma-separated large-cap tickers only. First version stays long-only and whitelist-bound.',
  },
} as const

const zhCn = {
  shell: {
    eyebrow: '美股自动交易工作台',
    tabs: {
      cockpit: '交易驾驶舱',
      candidates: '候选池',
      orders: '订单与持仓',
      settings: '设置',
    },
    mode: {
      paper: '模拟盘',
      live: '实盘',
    },
    labels: {
      autopilot: '自动驾驶',
      provider: '通道',
      liveGate: '实盘闸门',
      whitelist: '白名单',
      updated: '更新时间',
    },
  },
  pages: {
    cockpit: {
      title: '交易驾驶舱',
      description:
        '在一个操作界面里查看模式状态、资金、敞口、实盘准入结果以及最新一轮决策周期。',
    },
    candidates: {
      title: '候选池',
      description:
        '把确定性扫描、AI 排序和硬风控结论放在一起，在任何订单发出前先看清每个标的是否真的可做。',
    },
    orders: {
      title: '订单与持仓',
      description:
        '把已成交订单、当前持仓和最近决策周期并排展示，方便回放为什么买、为什么没买、为什么退出。',
    },
    settings: {
      title: '股票子系统设置',
      description:
        '单独配置白名单、默认模式和风险上限，不和现有 RWA 设置混在一起。',
    },
  },
  actions: {
    arm: '预备自动驾驶',
    run: '开始运行',
    pause: '暂停',
    halt: '触发停机',
    save: '保存设置',
    refresh: '刷新',
    retry: '重试',
  },
  sections: {
    capital: '资金与状态',
    guardrails: '风险护栏',
    providers: '通道状态',
    promotionGate: '实盘准入',
    positions: '当前持仓',
    latestCycle: '最近决策周期',
    candidateStream: '候选流',
    aiVerdict: 'AI 与风控结论',
    orderLog: '订单日志',
    cycleReplay: '决策回放',
    notifications: '通知',
    riskLimits: '风险限制',
    providerReadiness: '供应商就绪度',
  },
  metrics: {
    equity: '权益',
    buyingPower: '可用购买力',
    dayPnl: '当日盈亏',
    grossExposure: '总敞口',
    openPositions: '持仓数',
    candidates: '候选数',
    approved: '可执行',
    watchOnly: '仅观察',
    bestScore: '最高分',
    paperDays: '模拟交易日',
    fillRate: '成交回写率',
    maxDrawdown: '最大回撤',
    unresolved: '未对账订单',
  },
  fields: {
    defaultMode: '默认模式',
    notifications: '通知',
    whitelist: '白名单代码',
    singleCap: '单票仓位上限 (%)',
    grossCap: '总敞口上限 (%)',
    dailyLoss: '单日停损 (%)',
    maxPositions: '最大持仓数',
    maxEntries: '单标的单日最大新开仓次数',
    tradingWindow: '交易窗口 (ET)',
    extendedHours: '允许盘前盘后',
    marketableLimit: '使用可成交限价单',
  },
  values: {
    enabled: '开启',
    disabled: '关闭',
    yes: '是',
    no: '否',
  },
  states: {
    approved: '通过',
    blocked: '阻断',
    watchOnly: '仅观察',
    connected: '已连接',
    simulated: '模拟',
    unavailable: '不可用',
    paused: '暂停',
    armed: '已预备',
    running: '运行中',
    halted: '已停机',
  },
  empty: {
    positions: '当前模式下还没有持仓。',
    orders: '当前模式下还没有路由订单。',
    candidates: '还没有生成候选扫描。',
  },
  messages: {
    settingsSaved: '股票子系统设置已保存。',
    stateUpdated: '自动驾驶状态已更新。',
    killSwitch: '已触发停机开关。',
    paperOnly: '只有通过实盘准入闸门后，实盘模式才允许进入预备状态。',
    whitelistHint: '使用逗号分隔的大盘股代码。第一版只做多、只跑白名单。',
  },
} as const

const zhHk = {
  ...zhCn,
  shell: {
    ...zhCn.shell,
    eyebrow: '美股自動交易工作台',
    tabs: {
      cockpit: '交易駕駛艙',
      candidates: '候選池',
      orders: '訂單與持倉',
      settings: '設定',
    },
  },
  pages: {
    cockpit: {
      title: '交易駕駛艙',
      description:
        '在同一個操作介面查看模式狀態、資金、敞口、實盤準入結果，以及最近一輪決策週期。',
    },
    candidates: {
      title: '候選池',
      description:
        '把確定性掃描、AI 排序和硬風控結論放在一起，在任何訂單發出前先看清每個標的是否真的可做。',
    },
    orders: {
      title: '訂單與持倉',
      description:
        '把已成交訂單、當前持倉和最近決策週期並排展示，方便回放為什麼買、為什麼沒買、為什麼退出。',
    },
    settings: {
      title: '股票子系統設定',
      description:
        '獨立配置白名單、預設模式和風險上限，不和現有 RWA 設定混在一起。',
    },
  },
  values: {
    enabled: '開啟',
    disabled: '關閉',
    yes: '是',
    no: '否',
  },
  messages: {
    settingsSaved: '股票子系統設定已保存。',
    stateUpdated: '自動駕駛狀態已更新。',
    killSwitch: '已觸發停機開關。',
    paperOnly: '只有通過實盤準入閘門後，實盤模式才允許進入預備狀態。',
    whitelistHint: '使用逗號分隔的大盤股代碼。第一版只做多、只跑白名單。',
  },
} as const

export function useStocksCopy() {
  const locale = useAppStore((state) => state.locale)

  if (locale === 'zh-HK') {
    return zhHk
  }

  if (locale === 'zh-CN') {
    return zhCn
  }

  return en
}

