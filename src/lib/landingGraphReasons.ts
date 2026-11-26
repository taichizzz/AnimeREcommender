const PAIR_REASONS: Record<string, string> = {
  "52991:54492":
    "Both follow blunt, obsessive leads, Frieren hunting obscure spells and Maomao chasing poisons, who let small everyday cases slowly grow into real affection for the people around them.",
  "457:52991":
    "Frieren retracing old roads after the war and Ginko wandering rural Japan to treat strange mushi share the same unhurried road rhythm where most episodes end on a gentle ache.",
  "33352:52991":
    "Frieren trying to understand Himmel decades too late hits the exact same nerve as Violet writing letters for strangers while working out what her major meant by his final words.",
  "52701:52991":
    "Frieren taking detours to help sleepy villages and Laios stopping to cook monsters mid rescue both treat classic fantasy travel like lived in daily life instead of a rush to the boss.",
  "2966:52991":
    "An immortal elf traveling beside mortal companions mirrors Lawrence escorting a centuries old wolf goddess north, with both stories built around quiet road talk and borrowed time.",
  "457:54492":
    "Maomao diagnosing court poisonings and Ginko untangling folk hauntings both play like grounded detective work where every strange case turns out to have a human or natural cause.",
  "33352:54492":
    "Maomao piecing together palace secrets and Violet turning unspoken grief into letters both watch a guarded young woman slowly read the hidden feelings inside everyone she meets.",
  "52701:54492":
    "Maomao nerding out over toxic herbs and Laios sketching monster anatomy share the same infectious obsession where practical curiosity ends up saving lives when the real plot tightens.",
  "2966:54492":
    "Maomao trading dry barbs with Jinshi in the palace feels right at home beside Holo and Lawrence outsmarting rival merchants, since both thrive on sharp banter and clever schemes.",
  "457:33352":
    "Ginko arriving in one village at a time and Violet visiting strangers to ghostwrite their letters both build standalone stories about loss, memory, and leaving people a little lighter.",
  "457:52701":
    "Ginko studying how mushi fit into nature and Laios mapping the dungeon food chain both treat fantasy creatures like a real living ecosystem with rules you have to respect.",
  "457:2966":
    "Ginko walking mountain trails and Lawrence carting cargo between frontier towns share a calm folk atmosphere where old spirits and ordinary human work sit side by side.",
  "33352:52701":
    "Violet learning why people cling to small keepsakes and Laios cooking meals to keep his bruised party going both find genuine warmth in ordinary care amid dangerous journeys.",
  "2966:33352":
    "Violet opening up through the people she writes for and Holo softening toward Lawrence across winter roads both take their time letting a guarded bond turn real.",
  "2966:52701":
    "Laios budgeting dungeon rations and Lawrence haggling over silver coins both ground fantasy adventures in practical details while letting their weird lead pair steal every scene.",
};

/**
 * Returns a specific pairwise explanation for why two shows in the landing graph connect.
 */
export function getPairConnectionReason(malIdA: number, malIdB: number): string {
  const key =
    malIdA < malIdB ? `${malIdA}:${malIdB}` : `${malIdB}:${malIdA}`;
  return PAIR_REASONS[key] ?? "";
}
