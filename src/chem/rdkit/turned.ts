/**
 * A molblock with its 2D coordinates turned (step 8.5g, `DepictionOptions.turn`): (turn % 12) x 30 degrees clockwise on screen, 12 and up
 * mirrored left to right first. Only x and y change (a molblock's y points up, so the angle is negated). Mirroring would flip the
 * configuration a wedge or hash bond states, so a block that has one is not mirrored. `undefined`: refused (also a block that is not V2000).
 * A double bond with no cis/trans given is written "either" in a molblock and would be drawn crossed: the flag is cleared, so it is drawn as
 * the plain double bond a SMILES drawing shows (its lines then follow the coordinates, which a turn or mirror keeps).
 */
const WEDGE_FLAGS: ReadonlySet<number> = new Set([1, 4, 6]);

export function turnedBlock(block: string | undefined, turn: number): string | undefined {
  const lines = block?.split('\n');
  const counts = lines?.[3];
  if (lines === undefined || counts === undefined || !counts.includes('V2000')) return undefined;
  const atoms = Number(counts.slice(0, 3));
  const bonds = Number(counts.slice(3, 6));
  const mirrored = turn >= 12;
  if (mirrored && lines.slice(4 + atoms, 4 + atoms + bonds).some((line) => WEDGE_FLAGS.has(Number(line.slice(9, 12))))) return undefined;
  const angle = -((turn % 12) * Math.PI) / 6;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const field = (value: number): string => value.toFixed(4).padStart(10);
  for (let i = 4; i < 4 + atoms; i += 1) {
    const line = lines[i] ?? '';
    const x = (mirrored ? -1 : 1) * Number(line.slice(0, 10));
    const y = Number(line.slice(10, 20));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    lines[i] = field(x * cos - y * sin) + field(x * sin + y * cos) + line.slice(20);
  }
  for (let i = 4 + atoms; i < 4 + atoms + bonds; i += 1) {
    const line = lines[i] ?? '';
    if (Number(line.slice(6, 9)) === 2 && Number(line.slice(9, 12)) === 3) lines[i] = `${line.slice(0, 9)}  0${line.slice(12)}`;
  }
  return lines.join('\n');
}
