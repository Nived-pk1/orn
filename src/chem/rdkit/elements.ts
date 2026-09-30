/** Element symbols by atomic number (index 1 = H), for the Hill formula. The periodic table itself, not chemistry data of the app. */
const SYMBOLS = (
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe ' +
  'Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
).split(' ');

export const MAX_ATOMIC_NUMBER = SYMBOLS.length;

/** `undefined` for 0 (a dummy atom) or a number outside the table: the caller leaves the formula undefined rather than guess. */
export function symbolOf(atomicNumber: number): string | undefined {
  return Number.isInteger(atomicNumber) && atomicNumber >= 1 ? SYMBOLS[atomicNumber - 1] : undefined;
}
