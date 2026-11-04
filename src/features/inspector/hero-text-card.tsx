/** The peek's one-line fallback when the compact picture cannot be read (step 8.2a A2): the hero card's look: the .hero wrapper around it supplies the border, radius and paper, this adds 8 to 12 px padding and centres the words (its own border would double the frame). */
export function HeroTextCard(props: { readonly text: string }) {
  return (
    <p
      data-hero-text=""
      style={{
        margin: 0,
        padding: 'var(--space-2) var(--space-3)',
        textAlign: 'center',
        overflowWrap: 'anywhere',
      }}
    >
      {props.text}
    </p>
  );
}
