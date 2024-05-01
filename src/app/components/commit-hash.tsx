export function CommitHashDisplay() {
  const commitHash = process.env.COMMIT_HASH;

  if (!commitHash) return null;

  const href = `https://github.com/ubiquity/pay.ubq.fi/commit/${commitHash}`;

  const spliced = commitHash.slice(0, 7);

  return (
    <div id="build">
      <a href={href} target="_blank" rel="noreferrer">
        <span>{spliced}</span>
      </a>
    </div>
  );
}
