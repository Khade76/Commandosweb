export const DISCORD_URL = 'https://discord.gg/44thwardogs'
export const DONATE_URL = 'https://ko-fi.com/44thwardogs'
export const OFFICER_PANEL_URL = 'https://panel.44thwardogs.com'
export const STEAM_URL = 'https://store.steampowered.com/app/1867240/WARDOGS/'
export const STEAM_LAUNCH_URL = 'steam://run/1867240'

export const images = {
  mark: '/assets/44TH_CMM_Simple_DS_v4.png',
  patch: '/assets/44TH_CMM_Patch_DS_v4.png',
  hero: '/assets/Discord_Banner_B.jpg',
  wide: '/assets/Commandos_V5.jpg',
  banner: '/assets/Commandos_V5.jpg',
}

export const companies = [
  {
    key: 'vanguard',
    number: '01',
    tag: 'FORWARD // DECISIVE',
    name: 'Vanguard',
    logo: '/assets/companies/VANGUARD2.png',
    watermark: 'V',
    description: 'For players who thrive on momentum, coordinated pushes and turning pressure into progress.',
    detail: 'Vanguard is built around confident movement and decisive pressure. Its players communicate, commit to the plan and help create space for the wider regiment.',
    focus: ['Opening pushes', 'Forward pressure', 'Objective momentum', 'Fast regrouping'],
  },
  {
    key: 'spectre',
    number: '02',
    tag: 'ADAPTIVE // PRECISE',
    name: 'Spectre',
    logo: '/assets/companies/SPECTRE.png',
    watermark: 'S',
    description: 'For players who value awareness, positioning, flexibility and acting on good information.',
    detail: 'Spectre favours awareness and adaptability. Its members read the fight, react quickly and give the regiment reliable information and flexible support.',
    focus: ['Recon mindset', 'Flexible support', 'Flanking pressure', 'Situational awareness'],
  },
  {
    key: 'spartan',
    number: '03',
    tag: 'DISCIPLINED // RELIABLE',
    name: 'Spartan',
    logo: '/assets/companies/SPARTAN1.png',
    watermark: 'S',
    description: 'For players who bring staying power, discipline and dependable support when the fight gets difficult.',
    detail: 'Spartan is about consistency under pressure. Its players provide a dependable core that can hold ground, reinforce a push and keep functioning when the fight becomes chaotic.',
    focus: ['Defensive strength', 'Reinforcement play', 'Holding ground', 'Reliable support'],
  },
]

export const servers = [
  {
    id: 'wardogs-278c7bc5',
    name: '44th Commando Regiment — WARDOGS #1',
    status: 'Loading',
    region: 'Europe / UK',
    players: '— / 100',
    map: '—',
    mode: 'WARDOGS',
    joinCode: '89607037-07ad-4039-8f7d-1fb9a46e707b',
    scores: {
      valkyra: null,
      lonestar: null,
      manticore: null,
    },
    address: '',
    notes: 'Connecting to live server status…',
  },
  {
    id: 'wardogs-9290beb1',
    name: '44th Commando Regiment — WARDOGS #2',
    status: 'Loading',
    region: 'Europe / UK',
    players: '— / 100',
    map: '—',
    mode: 'WARDOGS',
    joinCode: '6eccb2c4-4e2a-4cf2-b2d5-67faf8e283b1',
    scores: {
      valkyra: null,
      lonestar: null,
      manticore: null,
    },
    address: '',
    notes: 'Connecting to live server status…',
  },
  {
    id: 'wardogs-hardcore',
    name: '44th Commandos #3 | Hardcore',
    status: 'Unavailable',
    region: 'Qonzer',
    players: '— / 100',
    map: '—',
    mode: 'Hardcore',
    joinCode: '529de475-7326-4178-81f0-f720aa9c9206',
    scores: {
      valkyra: null,
      lonestar: null,
      manticore: null,
    },
    address: '216.144.249.76:7779',
    notes: 'Qonzer-hosted Hardcore server. Live RCON status will appear once its WARDOGS API endpoint is configured.',
  },
  {
    id: 'training-events',
    name: '44th Training & Events',
    status: 'Planned',
    region: 'Europe / UK',
    players: '—',
    map: '—',
    mode: 'Events / Training',
    address: 'Future space for training, events and organised community nights.',
    notes: 'Can later show event passwords, whitelisting and restart notices.',
  },
]
