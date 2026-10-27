export const adminNotice = "Admin action may be taken at any time to protect the integrity of our server and community, including in situations involving loopholes or behaviour that undermines the intended purpose of these rules. An admin's decision is final."

export const ruleSections = [
  {
    id: 'community',
    title: 'Community Rules',
    rules: [
      {
        number: '1.1',
        title: 'Respect & Conduct',
        paragraphs: [
          'Trolling, harassment, bullying, personal insults, doxxing, antagonising, or deliberately provoking other members is prohibited.',
        ],
      },
      {
        number: '1.2',
        title: 'Hate Speech & Discrimination',
        paragraphs: [
          'Racist, sexist, homophobic, hateful, bigoted, discriminatory, or grossly offensive language, content, or behaviour is strictly prohibited.',
        ],
      },
      {
        number: '1.3',
        title: 'Banter',
        paragraphs: [
          'Friendly banter, jokes, and competitive trash talk are permitted. However, banter must not cross into harassment, bullying, personal attacks, hate speech, or other prohibited behaviour.',
        ],
      },
      {
        number: '1.4',
        title: 'Politics & Religion',
        paragraphs: [
          'Political and religious discussions are not permitted. This is a gaming community, not a forum for political or religious debate.',
        ],
      },
      {
        number: '1.5',
        title: 'Communication & Spamming',
        paragraphs: [
          'Spamming any form of communication, including voice chat, text chat, commands, or other communication systems, is prohibited.',
        ],
      },
      {
        number: '1.6',
        title: 'Advertising & Recruitment',
        paragraphs: [
          'Advertising, promotion, or recruitment of any kind is prohibited without explicit authorisation from administration.',
        ],
      },
      {
        number: '1.7',
        title: 'Impersonation',
        paragraphs: [
          'Impersonating another player, clan, community, or organisation is prohibited.',
          'Impersonating an administrator or other member of staff is strictly prohibited.',
        ],
      },
      {
        number: '1.8',
        title: 'Primary Language',
        paragraphs: [
          'English is the primary language of the server.',
          'Squads may communicate with their squad members in any language they choose. However, English must be used in Local Chat and All/Team Text Chat to ensure communication remains accessible to the wider server.',
        ],
        emphasis: 'English must be used in Local Chat and All/Team Text Chat',
      },
    ],
  },
  {
    id: 'general',
    title: 'General Rules',
    rules: [
      {
        number: '2.1',
        title: 'Fair Play',
        paragraphs: [
          'Players must participate fairly and must not attempt to gain an unfair or illegitimate advantage over other players.',
        ],
      },
      {
        number: '2.2',
        title: 'Cheating & Hacking',
        paragraphs: [
          'Cheating, hacking, or using unauthorised software, modifications, scripts, or third-party tools to gain an unfair advantage is strictly prohibited.',
        ],
      },
      {
        number: '2.3',
        title: 'Exploitation',
        paragraphs: [
          'Players may not intentionally exploit bugs or game mechanics, glitches, unintended mechanics, or other technical issues to gain an unfair or unintended advantage.',
        ],
      },
      {
        number: '2.4',
        title: 'Rule Evasion',
        paragraphs: [
          'Players may not intentionally exploit loopholes, ambiguities, or technicalities in these rules to circumvent their intended purpose.',
        ],
      },
      {
        number: '2.5',
        title: 'Ghosting & Stream-Sniping',
        paragraphs: [
          'Using information obtained through spectating, streams, recordings, external communications, or other sources that would not normally be available to the player in-game to gain an advantage is prohibited.',
        ],
      },
    ],
  },
  {
    id: 'gameplay',
    title: 'Gameplay Rules',
    rules: [
      {
        number: '3.1',
        title: 'Team Killing',
        paragraphs: [
          'Intentional team killing is strictly prohibited, regardless of the circumstances.',
          'Intentionally injuring, damaging, or otherwise deliberately harming friendly players will also be considered team killing.',
          'Accidental team kills must be acknowledged and apologised for immediately through in-game text chat.',
          'Repeated, reckless, or careless team kills may still result in administrative action, even when they were not intentional.',
        ],
      },
      {
        number: '3.2',
        title: 'Team Asset Protection',
        paragraphs: [
          'Players may not intentionally destroy, damage, sabotage, or otherwise misuse friendly team assets.',
          'This includes vehicles, deployables, equipment, ammunition, structures, and other assets belonging to their team.',
        ],
      },
      {
        number: '3.3',
        title: 'Friendly Vehicle Ramming',
        paragraphs: [
          'Repetitive or intentional ramming of friendly vehicles is prohibited.',
          'Intentionally running over teammates, particularly at or around spawn locations, is strictly prohibited.',
        ],
      },
      {
        number: '3.4',
        title: 'Economy Abuse',
        paragraphs: [
          "Players may not intentionally exploit, manipulate, or abuse the game's economy, progression systems, rewards, or other related mechanics to gain an unintended advantage.",
        ],
      },
      {
        number: '3.5',
        title: 'Unfair Gameplay Advantages',
        paragraphs: [
          'Players may not use unauthorised information, third-party assistance, exploits, or other methods to obtain an unfair gameplay advantage.',
          'This rule applies regardless of whether the method is specifically listed elsewhere in these rules.',
        ],
      },
      {
        number: '3.6',
        title: 'Disruptive Gameplay',
        paragraphs: [
          "Players must not intentionally disrupt, sabotage, abuse in-game mechanics or interfere with their team's ability to play the game.",
          'This includes deliberately blocking teammates, preventing objectives from being completed, intentionally obstructing friendly movement, or otherwise disrupting normal gameplay.',
        ],
      },
      {
        number: '3.7',
        title: 'Teaming',
        paragraphs: [
          'Players are prohibited from intentionally cooperating, coordinating, or teaming with enemy players in a way that disadvantages either team.',
          'This includes, but is not limited to, working together with enemy players to attack shared opponents, sharing information, deliberately avoiding combat with one another, assisting enemy players, or coordinating actions across opposing teams.',
          'Normal temporary situations where two enemy players happen to focus on the same threat are not considered teaming unless there is clear evidence of intentional cooperation.',
          'Any deliberate cross-team cooperation that undermines normal gameplay or provides an unfair advantage is considered a violation of this rule.',
        ],
      },
    ],
  },
  {
    id: 'enforcement',
    title: 'Enforcement',
    introduction: "Violations of these rules may result in administrative action. The severity of the action may depend on the nature of the violation, its impact on the community, and the player's previous history.",
    actionsIntroduction: 'Possible administrative actions may include:',
    actions: [
      'Verbal warning',
      'Official warning',
      'Removal from the server',
      'Temporary suspension',
      'Permanent removal from the community',
    ],
    paragraphs: [
      'Admins reserve the right to address violations on a case-by-case basis and take whatever action is reasonably necessary to maintain a fair, enjoyable, and respectful gaming environment.',
      'Repeated violations or attempts to circumvent previous administrative action may result in increased penalties.',
    ],
    agreement: 'By participating on the server, you agree to follow these rules and respect the decisions of administration.',
  },
]
