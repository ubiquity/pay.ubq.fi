import ClaimsPortal from "./components/claims-portal";

export default async function Page(params: { searchParams: { claim: string } }) {
  return <ClaimsPortal permits={permitData} supabaseUser={user} />;

  /**
   * good idea to have section for account setup, options, etc. here if we don't have a permit
  // return <ClaimsPortal permits={permitData} githubUser={githubUser} supabaseUser={user} />;
   * 
   */
}