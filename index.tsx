/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// Fix: Import React to use React.Fragment
import React, {useState, FormEvent, useEffect, useCallback, ChangeEvent, useRef} from 'react';
import ReactDOM from 'react-dom/client';
import {jsx as _jsx, jsxs as _jsxs} from 'react/jsx-runtime';
import { createClient, User as SupabaseUser, Session, SupabaseClient, PostgrestError } from '@supabase/supabase-js';

// --- Supabase Configuration ---
// IMPORTANT: Replace with your Supabase Project URL and Anon Key
// Fix: Initialize SUPABASE_URL with the placeholder string 'YOUR_SUPABASE_URL'.
// Fix: Explicitly typed SUPABASE_URL as string to allow comparison with placeholder strings and prevent TypeScript error TS2367.
const SUPABASE_URL: string = 'https://irtabmlgcrmhtbjniqst.supabase.co'; // e.g., 'https://xyz.supabase.co'
// Fix: Initialize SUPABASE_ANON_KEY with the placeholder string 'YOUR_SUPABASE_ANON_KEY'.
// Fix: Explicitly typed SUPABASE_ANON_KEY as string to allow comparison with placeholder strings and prevent TypeScript error TS2367.
const SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlydGFibWxnY3JtaHRiam5pcXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxODI3NjgsImV4cCI6MjA2Mzc1ODc2OH0.7J1sSiuvRmRf0TvZ62DcJ35FzUVrho1p54zg-VB0e98';

let supabase: SupabaseClient | null = null;

// --- Helper Functions for Validation ---
const isValidSupabaseHttpUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // Basic check: Supabase URLs are https and typically end with .supabase.co or .supabase.in
    return parsed.protocol === 'https:' && (parsed.host.endsWith('.supabase.co') || parsed.host.endsWith('.supabase.in'));
  } catch (e) {
    return false;
  }
};

// Conditionally initialize Supabase client
if (
  SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
  SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
) {
  let canInitialize = true;

  if (!isValidSupabaseHttpUrl(SUPABASE_URL)) {
    console.error(
      `CRITICAL CONFIGURATION ERROR: Invalid SUPABASE_URL format: "${SUPABASE_URL}". ` +
      `It should be your Supabase project's HTTPS URL, e.g., "https://<your-project-id>.supabase.co". ` +
      `The current value looks like a database connection string, which is incorrect for the client.`
    );
    canInitialize = false;
  }

  if (SUPABASE_ANON_KEY.startsWith('sbp_')) {
    console.error(
      "CRITICAL SECURITY RISK: SUPABASE_ANON_KEY appears to be a service role key (starts with 'sbp_'). " +
      "DO NOT use service role keys in client-side code. This key has admin privileges and should never be exposed in the browser. " +
      "Please use your project's public 'anon' key."
    );
    canInitialize = false;
  }

  if (canInitialize) {
    try {
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true, // Persist session in localStorage
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } catch (error) {
      console.error("Failed to initialize Supabase client. Check SUPABASE_URL and SUPABASE_ANON_KEY in index.tsx. Ensure they are correct and the project is accessible.", error);
      // supabase remains null, App component will display an error message.
    }
  }
} else {
    // This case handles when the placeholders are still present.
    // The App component will show the "Supabase Not Configured" message.
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        console.warn("Supabase client not initialized because placeholder URL/Key is used. Please configure SUPABASE_URL and SUPABASE_ANON_KEY in index.tsx.");
    }
}


// --- Interfaces ---
interface SiteCore { // Data stored in Supabase 'sites' table
  id: string; // Supabase UUID
  user_id: string;
  name: string;
  url: string;
  wp_username: string; // Changed from 'username' to avoid conflict
  wp_application_password?: string; // Changed from 'applicationPassword'
  created_at?: string;
}

interface SiteClientState extends SiteCore { // Client-side full state
  drafts: number | null;
  published: number | null;
  lastPublishedDate: string | null;
  isLoading: boolean;
  error: string | null;
}

function App() {
  const [sites, setSites] = useState<SiteClientState[]>([]);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteWPUsername, setNewSiteWPUsername] = useState(''); // Updated state name
  const [newSiteAppPassword, setNewSiteAppPassword] = useState('');
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Auth state
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true); // Start true, set to false after initial check
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState(''); // Using email for Supabase auth
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Account Delete Modal State
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('');

  // Site Delete Modal State
  const [showDeleteSiteModal, setShowDeleteSiteModal] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<SiteClientState | null>(null);
  const [deleteSiteConfirmText, setDeleteSiteConfirmText] = useState('');
  const [siteDeleteError, setSiteDeleteError] = useState<string | null>(null);

  // Site Edit State
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editingSiteNameInput, setEditingSiteNameInput] = useState<string>('');
  const [siteEditError, setSiteEditError] = useState<string | null>(null);


  const [isFetchingSites, setIsFetchingSites] = useState(false);
  const [initialSitesFetchFailedDueToMissingTable, setInitialSitesFetchFailedDueToMissingTable] = useState(false);
  const [initialWpFetchCompletedForSession, setInitialWpFetchCompletedForSession] = useState(false);
  const initialWpFetchCompletedForSessionRef = useRef(initialWpFetchCompletedForSession);

  useEffect(() => {
    initialWpFetchCompletedForSessionRef.current = initialWpFetchCompletedForSession;
  }, [initialWpFetchCompletedForSession]);


  // Supabase Auth Listener
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false); // No auth to check if Supabase isn't initialized
      return;
    }
    setAuthLoading(true);
    let activeUser: SupabaseUser | null = null;

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      if (activeUser?.id !== user?.id) { // Reset flag if user changes
        setInitialSitesFetchFailedDueToMissingTable(false);
        setInitialWpFetchCompletedForSession(false); 
        initialWpFetchCompletedForSessionRef.current = false;
      }
      setCurrentUser(user);
      activeUser = user; 
      setAuthLoading(false);
      if (!user) {
        setSites([]); 
        setEditingSiteId(null); 
      }
    });

    // Check initial session
     supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      activeUser = user;
      setAuthLoading(false);
      if (!user) {
        setInitialSitesFetchFailedDueToMissingTable(false); 
        setInitialWpFetchCompletedForSession(false);
        initialWpFetchCompletedForSessionRef.current = false;
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []); 

  const isValidUrl = (url: string): boolean => {
    if (!url) return false;
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ;
    } catch (_) {
      return false;
    }
  };

  const fetchSiteDataWordPress = useCallback(async (siteId: string, siteUrl: string, wpUsername: string, appPassword?: string) => {
    if (!appPassword) {
        setSites(prevSites =>
          prevSites.map(site =>
            site.id === siteId ? {...site, isLoading: false, error: 'Application Password is required to fetch data from WordPress.'} : site
          )
        );
        return;
    }
     if (!siteUrl || !isValidUrl(siteUrl)) { 
        setSites(prevSites =>
          prevSites.map(site =>
            site.id === siteId ? {...site, isLoading: false, error: 'Invalid site URL provided. Cannot fetch WordPress data.'} : site
          )
        );
        return;
    }

    setSites(prevSites =>
      prevSites.map(site =>
        site.id === siteId ? { ...site, isLoading: true, error: null } : site
      )
    );

    const headers = new Headers();
    headers.append('Authorization', 'Basic ' + btoa(`${wpUsername}:${appPassword}`));
    const cacheBust = `&_=${new Date().getTime()}`;

    try {
      const draftResponse = await fetch(
        `${siteUrl}/wp-json/wp/v2/posts?status=draft&per_page=1&context=embed${cacheBust}`,
        {headers, mode: 'cors'} 
      );
      if (!draftResponse.ok) throw new Error(`Drafts: HTTP ${draftResponse.status} ${draftResponse.statusText}`);
      const draftCount = parseInt(draftResponse.headers.get('X-WP-Total') || '0', 10);

      const publishedResponse = await fetch(
        `${siteUrl}/wp-json/wp/v2/posts?status=publish&per_page=1&orderby=date&order=desc&context=embed${cacheBust}`,
        {headers, mode: 'cors'} 
      );
      if (!publishedResponse.ok) throw new Error(`Published: HTTP ${publishedResponse.status} ${publishedResponse.statusText}`);
      const publishedCount = parseInt(publishedResponse.headers.get('X-WP-Total') || '0', 10);

      let lastPublishedPostDate: string | null = null;
      if (publishedCount > 0) {
        const publishedPostsData = await publishedResponse.json();
        if (publishedPostsData && publishedPostsData.length > 0 && publishedPostsData[0].date_gmt) { 
            lastPublishedPostDate = publishedPostsData[0].date_gmt;
        } else if (publishedPostsData && publishedPostsData.length > 0 && publishedPostsData[0].date) { 
            lastPublishedPostDate = publishedPostsData[0].date;
        }
      }

      setSites(prevSites =>
        prevSites.map(site =>
          site.id === siteId
            ? { ...site, isLoading: false, drafts: draftCount, published: publishedCount, lastPublishedDate: lastPublishedPostDate, error: null }
            : site
        )
      );
    } catch (error: any) {
      console.error("Fetch error for WordPress site", siteUrl, error.message || error);
      let errorMessage = `WordPress API Error: ${error.message}. Ensure REST API is active and credentials are correct.`;
      
      if (error.message && typeof error.message === 'string' && error.message.toLowerCase().includes('failed to fetch')) {
        errorMessage = `Network Error: Failed to fetch data from WordPress site (${siteUrl}). This is often a CORS (Cross-Origin Resource Sharing) issue. Please ensure your WordPress server is configured to allow requests from this web app's origin: ${window.location.origin}. Common solutions involve adding 'Access-Control-Allow-Origin: ${window.location.origin}' and 'Access-Control-Allow-Headers: Authorization, Content-Type' headers on your WordPress server (e.g., via .htaccess, theme functions.php, or a CORS plugin). Also verify network connectivity, that the site URL is correct and accessible, and no browser extensions are blocking the request.`;
      } else if (error.message && typeof error.message === 'string' && (error.message.includes('HTTP 401') || error.message.includes('HTTP 403'))) {
        errorMessage = `Authentication/Authorization Error (${error.message.match(/HTTP \d+/)?.[0] || 'status unknown'}): Please double-check your WordPress Username and Application Password. Ensure the Application Password has not been revoked and has sufficient permissions for the REST API. The site might be password-protected or require specific IP whitelisting.`;
      } else if (error.message && typeof error.message === 'string' && error.message.includes('HTTP 404')) {
        errorMessage = `Not Found Error (HTTP 404): The WordPress REST API endpoint might be incorrect or disabled. Ensure your site URL "${siteUrl}" is correct and the REST API is active (e.g., check if ${siteUrl}/wp-json/ is accessible). Some security plugins might block REST API access.`;
      } else if (error.message && typeof error.message === 'string') {
        errorMessage = `WordPress API Error: ${error.message}. Ensure REST API is active, site URL is correct, credentials are valid, and check for any WordPress security plugin interference.`;
      } else {
        errorMessage = `An unknown WordPress API error occurred for site ${siteUrl}. Check the browser console for more details.`;
      }

      setSites(prevSites =>
        prevSites.map(site =>
          site.id === siteId
            ? { ...site, isLoading: false, error: errorMessage }
            : site
        )
      );
    }
  }, []);

  const fetchUserSites = useCallback(async () => {
    if (!supabase || !currentUser || isFetchingSites || initialSitesFetchFailedDueToMissingTable) {
      if (initialSitesFetchFailedDueToMissingTable) {
        setGlobalError("Critical Error: The 'sites' table does not exist in your Supabase database. Please create it according to the documentation/instructions.");
      }
      return;
    }

    setIsFetchingSites(true);
    setGlobalError(null);

    try {
      const { data, error: supabaseError } = await supabase
        .from('sites')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: true });

      if (supabaseError) {
        console.error('Error fetching sites from Supabase. Raw error object:', supabaseError);
        const pgError = supabaseError as PostgrestError;
        let userErrorMessage = `Failed to load sites: ${pgError.message}. Check console for details.`;

        if (pgError.code === '42P01') {
          userErrorMessage = "Critical Error: The 'sites' table does not exist in your Supabase database. Please create it according to the documentation/instructions. You may need to log out and log back in after creating the table.";
          setInitialSitesFetchFailedDueToMissingTable(true);
        } else if (pgError.message && pgError.message.toLowerCase().includes('failed to fetch')) {
            userErrorMessage = `Network Error: Failed to fetch data from Supabase. This could be due to:\n` +
                               `1. CORS (Cross-Origin Resource Sharing) issues: Ensure your Supabase project allows requests from this web app's origin (${window.location.origin}). Check Authentication > URL Configuration > Allowed Origins in your Supabase dashboard.\n` +
                               `2. Network connectivity problems on your side.\n` +
                               `3. Ad blockers or browser extensions interfering with requests.\n` +
                               `Please check these and try again. Details: ${pgError.details || pgError.message}`;
            console.error(`User-facing error message context for "Failed to fetch": ${userErrorMessage}`);
        } else {
          userErrorMessage = `Failed to load sites: ${pgError.message}. Common issues: RLS policies missing/incorrect for 'sites' table (ensure SELECT is allowed for user's own data), or network problems.`;
        }
        console.error(
            `Detailed Supabase Error:\n` +
            `  Message: ${pgError.message}\n` +
            `  Details: ${pgError.details}\n` +
            `  Hint: ${pgError.hint}\n` +
            `  Code: ${pgError.code}`
        );
        setGlobalError(userErrorMessage);
        setSites([]);
      } else if (data) {
        setInitialSitesFetchFailedDueToMissingTable(false);
        const supabaseSites: SiteCore[] = data;
        
        // Use the ref to read the current value of initialWpFetchCompletedForSession
        // This avoids making `fetchUserSites` dependent on the state variable `initialWpFetchCompletedForSession`
        // for its identity, which helps in breaking potential `useEffect` loops.
        const isFirstMajorFetchAttemptForSession = !initialWpFetchCompletedForSessionRef.current;

        const newClientSitesState: SiteClientState[] = supabaseSites.map(siteCore => {
          // For merging, we need the *current* `sites` state.
          // This is tricky if we want `sites` not to be a direct dep of `fetchUserSites`'s `useCallback`.
          // The original code correctly uses `sites` from the closure, which is fine if the `useEffect` loop is broken elsewhere.
          const existingClientSite = sites.find(s => s.id === siteCore.id); // Reading current sites state

          const hasValidUrlValue = isValidUrl(siteCore.url);
          const hasAllCredentialsValue = siteCore.wp_application_password && siteCore.wp_username && hasValidUrlValue;
          
          let computedError: string | null = null;
          let shouldLoadWpData = false;

          if (isFirstMajorFetchAttemptForSession || !existingClientSite) {
            if (hasAllCredentialsValue) {
              shouldLoadWpData = true;
            } else {
              if (!hasValidUrlValue && siteCore.url) { 
                computedError = "Invalid site URL. Cannot fetch WordPress data.";
              } else if (!siteCore.url) {
                computedError = "Site URL missing. Cannot fetch WordPress data.";
              } else if (!siteCore.wp_application_password) {
                computedError = "Application Password missing. Cannot fetch WordPress data.";
              } else if (!siteCore.wp_username) {
                computedError = "WordPress Username missing. Cannot fetch WordPress data.";
              } else {
                computedError = "WordPress credentials incomplete or invalid URL. Cannot fetch WordPress data.";
              }
            }
            return {
              ...siteCore,
              drafts: null,
              published: null,
              lastPublishedDate: null,
              isLoading: shouldLoadWpData,
              error: computedError,
            };
          } else { 
            return {
              ...siteCore, 
              drafts: existingClientSite.drafts,
              published: existingClientSite.published,
              lastPublishedDate: existingClientSite.lastPublishedDate,
              isLoading: existingClientSite.isLoading, 
              error: existingClientSite.error,       
            };
          }
        });

        setSites(newClientSitesState);

        if (isFirstMajorFetchAttemptForSession && newClientSitesState.length > 0) {
            // It's important this is set to true *after* this first pass of evaluation
            // to prevent subsequent calls within the same session from re-triggering mass WP fetches.
            setInitialWpFetchCompletedForSession(true); 
        }
        
        newClientSitesState.forEach(site => {
          if (site.isLoading && site.url && site.wp_username && site.wp_application_password) {
            fetchSiteDataWordPress(site.id, site.url, site.wp_username, site.wp_application_password);
          }
        });
      }
    } catch (e: any) {
        console.error("Unexpected error during fetchUserSites:", e);
        setGlobalError(`An unexpected error occurred while fetching sites: ${e.message || 'Unknown error'}`);
        setSites([]);
    } finally {
      setIsFetchingSites(false);
    }
  }, [
    currentUser, 
    initialSitesFetchFailedDueToMissingTable, 
    fetchSiteDataWordPress, 
    sites, // `sites` is still a dependency here due to `sites.find`
    // initialWpFetchCompletedForSession, // Replaced by ref for reading inside
    setInitialWpFetchCompletedForSession // Still needed for setting
    // Supabase is available in closure
  ]);


  useEffect(() => {
    if (currentUser?.id && supabase && !initialSitesFetchFailedDueToMissingTable) {
        fetchUserSites();
    } else if (!currentUser) {
        setSites([]);
        if (isFetchingSites) setIsFetchingSites(false); // Ensure loading state is reset
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, supabase, initialSitesFetchFailedDueToMissingTable]);
  // By removing fetchUserSites from this dependency array, we prevent the loop
  // where changes to `sites` (a dependency of fetchUserSites) would recreate
  // fetchUserSites and re-trigger this effect. The effect will now only run
  // when currentUser, supabase instance, or table status fundamentally changes.

  const handleAddSite = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
        setGlobalError("Supabase is not configured or failed to initialize. Please check console and configuration.");
        return;
    }
    if (!currentUser) {
        setGlobalError("You must be logged in to add sites.");
        return;
    }
    if (initialSitesFetchFailedDueToMissingTable) {
        setGlobalError("Cannot add sites: The 'sites' table is missing in the database. Please create it first.");
        return;
    }
    setGlobalError(null);
    setSiteDeleteError(null);

    if (!newSiteName.trim() || !newSiteUrl.trim() || !newSiteWPUsername.trim() || !newSiteAppPassword.trim()) {
      setGlobalError('All fields (Site Name, URL, WordPress Username, Application Password) are required.');
      return;
    }
    const trimmedUrl = newSiteUrl.trim().replace(/\/+$/, '');
    if (!isValidUrl(trimmedUrl)) {
      setGlobalError('Please enter a valid site URL (e.g., https://example.com).');
      return;
    }

    if (sites.some(site => site.url === trimmedUrl && site.wp_username === newSiteWPUsername.trim())) {
      setGlobalError('This site URL with the same WordPress username has already been added to your current list.');
      return;
    }

    const siteCoreData: Omit<SiteCore, 'id' | 'user_id' | 'created_at'> = {
      name: newSiteName.trim(),
      url: trimmedUrl,
      wp_username: newSiteWPUsername.trim(),
      wp_application_password: newSiteAppPassword.trim(),
    };

    const { data, error } = await supabase
      .from('sites')
      .insert({ ...siteCoreData, user_id: currentUser.id })
      .select()
      .single();

    if (error) {
      console.error('Error adding site to Supabase:', error);
      const pgError = error as PostgrestError;
      let userErrorMessage = `Failed to add site: ${pgError.message}. Check RLS policies (ensure INSERT is allowed) and table schema.`;
      if (pgError.code === '42P01') {
         userErrorMessage = "Critical Error: The 'sites' table does not exist. Site cannot be saved. Please create the table in Supabase.";
         setInitialSitesFetchFailedDueToMissingTable(true);
      } else if (pgError.message && pgError.message.toLowerCase().includes('failed to fetch')) {
           userErrorMessage = `Network Error: Failed to add site. Could be CORS (origin: ${window.location.origin}), network issues, or ad blockers. Details: ${pgError.details || pgError.message}`;
      }
      setGlobalError(userErrorMessage);
      return;
    }

    if (data) {
      const newSiteClientState: SiteClientState = {
        ...(data as SiteCore),
        drafts: null,
        published: null,
        lastPublishedDate: null,
        isLoading: true, 
        error: null,
      };
      setSites(prevSites => [...prevSites, newSiteClientState]);
      setNewSiteName('');
      setNewSiteUrl('');
      setNewSiteWPUsername('');
      setNewSiteAppPassword('');
      if (newSiteClientState.wp_application_password && isValidUrl(newSiteClientState.url)) {
        await fetchSiteDataWordPress(newSiteClientState.id, newSiteClientState.url, newSiteClientState.wp_username, newSiteClientState.wp_application_password);
      } else if (!isValidUrl(newSiteClientState.url)){
         setSites(prev => prev.map(s => s.id === newSiteClientState.id ? {...s, isLoading: false, error: "Invalid site URL. Cannot fetch WordPress data."} : s));
      } else {
         setSites(prev => prev.map(s => s.id === newSiteClientState.id ? {...s, isLoading: false, error: "Application password missing. Cannot fetch WordPress data."} : s));
      }
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString); 

      const year = date.getUTCFullYear();
      const month = (date.getUTCMonth() + 1).toString().padStart(2, '0'); 
      const day = date.getUTCDate().toString().padStart(2, '0');

      return `${year}/${month}/${day}`;
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Invalid Date';
    }
  };

  // --- Auth Handlers ---
  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
        setAuthError("Supabase is not configured or failed to initialize. Please check console and configuration.");
        return;
    }
    setAuthError(null);
    setGlobalError(null);
    setInitialSitesFetchFailedDueToMissingTable(false);
    setInitialWpFetchCompletedForSession(false);
    initialWpFetchCompletedForSessionRef.current = false;
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Email and password are required.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
    });
    if (error) {
      setAuthError(error.message);
    } else if (data.user) {
      setAuthEmail('');
      setAuthPassword('');
      if (data.user.aud === 'authenticated' && !data.session) {
         setGlobalError("Signup successful. Please check your email to confirm your account.");
      } else if (data.session) {
         setGlobalError(null); 
      }
    } else if (!data.session && !data.user){
        setAuthError("Signup attempt made, but no user or session data returned. Please check your email for confirmation or try logging in.");
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) {
        setAuthError("Supabase is not configured or failed to initialize. Please check console and configuration.");
        return;
    }
    setAuthError(null);
    setGlobalError(null);
    setInitialSitesFetchFailedDueToMissingTable(false);
    setInitialWpFetchCompletedForSession(false); 
    initialWpFetchCompletedForSessionRef.current = false;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });
    if (error) {
      setAuthError(error.message);
    } else if (data.user) {
      setAuthEmail('');
      setAuthPassword('');
      setGlobalError(null); 
    }
  };

  const handleLogout = async () => {
    if (!supabase) {
        setGlobalError("Supabase is not configured or failed to initialize. Cannot logout.");
        return;
    }
    setGlobalError(null);
    setInitialSitesFetchFailedDueToMissingTable(false);
    setInitialWpFetchCompletedForSession(false);
    initialWpFetchCompletedForSessionRef.current = false;
    setEditingSiteId(null); 
    const { error } = await supabase.auth.signOut();
    if (error) {
      setGlobalError(`Logout failed: ${error.message}`);
    } else {
      setAuthView('login'); 
    }
  };

  // --- Account Delete Handlers ---
  const handleShowAccountDeleteModal = () => {
    setGlobalError(null); 
    setShowDeleteAccountModal(true);
  };

  const handleCancelAccountDelete = () => {
    setShowDeleteAccountModal(false);
    setDeleteAccountConfirmText('');
    setGlobalError(null); 
  };

  const handleConfirmAccountDeletion = async () => {
    if (deleteAccountConfirmText !== 'delete') {
      setGlobalError("You must type 'delete' to confirm account deletion.");
      return;
    }
    if (!supabase) {
        setGlobalError("Supabase is not configured or failed to initialize. Cannot delete account data.");
        return;
    }
    if (!currentUser) {
      setGlobalError("No user logged in to delete.");
      handleCancelAccountDelete();
      return;
    }

    setGlobalError(null);

    if (!initialSitesFetchFailedDueToMissingTable) {
        const { error: sitesDeleteError } = await supabase
          .from('sites')
          .delete()
          .eq('user_id', currentUser.id);

        if (sitesDeleteError) {
          const pgError = sitesDeleteError as PostgrestError;
          let userErrorMessage = `Error deleting site data: ${pgError.message}. Please try again or check RLS policies (ensure DELETE is allowed).`;
           if (pgError.message && pgError.message.toLowerCase().includes('failed to fetch')) {
            userErrorMessage = `Network Error: Failed to delete site data. Could be CORS (origin: ${window.location.origin}), network issues, or ad blockers. Details: ${pgError.details || pgError.message}`;
          }
          setGlobalError(userErrorMessage); 
          return;
        }
    }

    await handleLogout(); 
    handleCancelAccountDelete();
    
    setTimeout(() => setGlobalError("All your site data (if the 'sites' table existed and wasn't missing) has been deleted and you have been logged out. To fully delete your user account from the system, contact support (if applicable) or use Supabase admin tools."), 0);
  };


  // --- Site Delete Handlers ---
  const handleShowDeleteSiteModal = (siteToDel: SiteClientState) => {
    if (editingSiteId === siteToDel.id) handleCancelEditSiteName(); 
    setSiteToDelete(siteToDel);
    setSiteDeleteError(null);
    setGlobalError(null); 
    setDeleteSiteConfirmText('');
    setShowDeleteSiteModal(true);
  };

  const handleCancelSiteDeletion = () => {
    setShowDeleteSiteModal(false);
    setSiteToDelete(null);
    setDeleteSiteConfirmText('');
    setSiteDeleteError(null);
  };

  const handleConfirmSiteDeletion = async () => {
    if (deleteSiteConfirmText !== 'delete') {
      setSiteDeleteError("You must type 'delete' to confirm site deletion.");
      return;
    }
    if (!supabase) {
        setSiteDeleteError("Supabase is not configured or failed to initialize. Cannot delete site.");
        return;
    }
    if (!siteToDelete || !currentUser) {
      setSiteDeleteError("Error: No site selected or user not logged in.");
      handleCancelSiteDeletion();
      return;
    }
    
    if (initialSitesFetchFailedDueToMissingTable) {
        setSiteDeleteError("Cannot delete site: The 'sites' table is missing in the database.");
        return;
    }

    const { error } = await supabase
      .from('sites')
      .delete()
      .eq('id', siteToDelete.id)
      .eq('user_id', currentUser.id);

    if (error) {
      console.error('Error deleting site from Supabase:', error);
      const pgError = error as PostgrestError;
      let userErrorMessage = `Failed to delete site: ${pgError.message}. Check RLS policies (ensure DELETE is allowed).`;
       if (pgError.message && pgError.message.toLowerCase().includes('failed to fetch')) {
           userErrorMessage = `Network Error: Failed to delete site. Could be CORS (origin: ${window.location.origin}), network issues, or ad blockers. Details: ${pgError.details || pgError.message}`;
      }
      setSiteDeleteError(userErrorMessage);
    } else {
      setSites(prevSites => prevSites.filter(s => s.id !== siteToDelete.id));
      handleCancelSiteDeletion();
    }
  };

  // --- Site Reload Handler ---
  const handleReloadSite = useCallback(async (siteId: string) => {
    if (editingSiteId === siteId) return; 
    const siteToReload = sites.find(s => s.id === siteId);

    if (!siteToReload) {
        console.error("Cannot reload: Site not found", siteId);
        setGlobalError(`Error: Could not find site with ID ${siteId} to reload.`);
        return;
    }

    if (siteToReload.isLoading) { 
        return;
    }
    
    let errorForSite: string | null = null;
    if (!siteToReload.url || !isValidUrl(siteToReload.url)) {
      errorForSite = "Cannot reload: Invalid or missing site URL.";
    } else if (!siteToReload.wp_username) {
      errorForSite = "Cannot reload: Missing WordPress username.";
    } else if (!siteToReload.wp_application_password) {
      errorForSite = "Cannot reload: Missing application password.";
    }

    if (errorForSite) {
        setSites(prevSites =>
            prevSites.map(s =>
                s.id === siteId ? { ...s, isLoading: false, error: errorForSite } : s
            )
        );
        return;
    }
    
    if (siteToReload.url && siteToReload.wp_username && siteToReload.wp_application_password) {
      await fetchSiteDataWordPress(siteToReload.id, siteToReload.url, siteToReload.wp_username, siteToReload.wp_application_password);
    }
  }, [sites, fetchSiteDataWordPress, editingSiteId]);


  // --- Site Name Edit Handlers ---
  const handleStartEditSiteName = (site: SiteClientState) => {
    setEditingSiteId(site.id);
    setEditingSiteNameInput(site.name);
    setSiteEditError(null); 
    setGlobalError(null); 
  };

  const handleCancelEditSiteName = () => {
    setEditingSiteId(null);
    setEditingSiteNameInput('');
    setSiteEditError(null);
  };

  const handleSaveSiteName = async () => {
    if (!editingSiteId ) {
        setSiteEditError("Error: No site selected for editing.");
        return;
    }
    if(!editingSiteNameInput.trim()){
        setSiteEditError("Site name cannot be empty.");
        return;
    }
    if (!supabase || !currentUser) {
      setSiteEditError("Supabase client not available or user not logged in.");
      return;
    }
    if (initialSitesFetchFailedDueToMissingTable) {
      setSiteEditError("Cannot save: The 'sites' table is missing in the database.");
      return;
    }

    const trimmedName = editingSiteNameInput.trim();
    const originalSite = sites.find(s => s.id === editingSiteId);
    if (originalSite && originalSite.name === trimmedName) { 
        handleCancelEditSiteName();
        return;
    }


    const { error: updateError } = await supabase
      .from('sites')
      .update({ name: trimmedName })
      .eq('id', editingSiteId)
      .eq('user_id', currentUser.id);

    if (updateError) {
      console.error('Error updating site name in Supabase:', updateError);
      const pgError = updateError as PostgrestError;
      let userErrorMessage = `Failed to update site name: ${pgError.message}.`;
      if (pgError.message && pgError.message.toLowerCase().includes('failed to fetch')) {
           userErrorMessage = `Network Error: Failed to update site name. Could be CORS (origin: ${window.location.origin}), network issues, or ad blockers. Details: ${pgError.details || pgError.message}`;
      }
      setSiteEditError(userErrorMessage);
    } else {
      setSites(prevSites =>
        prevSites.map(s =>
          s.id === editingSiteId ? { ...s, name: trimmedName } : s
        )
      );
      handleCancelEditSiteName();
    }
  };

  // --- Refresh All Sites Handler ---
  const handleRefreshAllSites = async () => {
     if (isFetchingSites) {
        setGlobalError("Site list is currently being fetched, please wait.");
        return;
    }
    if (!sites.length && !initialSitesFetchFailedDueToMissingTable) {
        setGlobalError("No sites to refresh. Add some sites first!");
        return;
    }
    if (initialSitesFetchFailedDueToMissingTable) {
        setGlobalError("Cannot refresh: The 'sites' table is missing in the database.");
        return;
    }
    setGlobalError(null);
    
    let refreshableSiteFound = false;
    let alreadyLoadingCount = 0;
    
    sites.forEach(site => {
        if (site.isLoading) {
            alreadyLoadingCount++;
            refreshableSiteFound = true; 
        } else if (site.url && isValidUrl(site.url) && site.wp_username && site.wp_application_password) {
            refreshableSiteFound = true;
            fetchSiteDataWordPress(site.id, site.url, site.wp_username, site.wp_application_password);
        }
    });

    if (!refreshableSiteFound && sites.length > 0) { 
        setGlobalError("No sites could be refreshed (e.g., missing credentials, invalid URLs). Check individual site statuses.");
    } else if (alreadyLoadingCount === sites.length && sites.length > 0) {
        setGlobalError("All sites are already in the process of loading data.");
    } else if (sites.length === 0 && !initialSitesFetchFailedDueToMissingTable) { 
        setGlobalError("No sites to refresh.");
    }
  };


  // Render placeholder warning if Supabase URL/Key are not replaced
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY' || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return _jsxs('div', {
      className: 'app-container',
      style: {textAlign: 'center', padding: '50px', backgroundColor: '#fff1f0', border: '1px solid #ffccc7'},
      children: [
        _jsx('h1', { style: {color: '#cf1322'}, children: 'Supabase Not Configured' }),
        _jsx('p', { children: 'Please update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `index.tsx` with your Supabase project credentials.' }),
        _jsx('p', { children: 'Ensure you use your project\'s HTTPS URL (e.g., https://xyz.supabase.co) and your public "anon" key.'}),
        _jsx('p', { children: 'You also need to create a `sites` table in your Supabase database as per the instructions previously provided.'})
      ]
    });
  }

  // Render error if Supabase client failed to initialize (e.g. invalid non-placeholder URL/Key, or other init error)
  if (!supabase) {
    return _jsxs('div', {
      className: 'app-container',
      style: {textAlign: 'center', padding: '50px', backgroundColor: '#fffbe6', border: '1px solid #ffe58f'},
      children: [
        _jsx('h1', { style: {color: '#d46b08'}, children: 'Supabase Initialization Failed' }),
        _jsx('p', { children: 'The Supabase client could not be initialized. This can happen if:' }),
        _jsxs('ul', { style: { listStylePosition: 'inside', textAlign: 'left', display: 'inline-block', marginTop: '10px', marginBottom: '10px' }, children: [
            _jsx('li', { children: '`SUPABASE_URL` is not your project\'s HTTPS URL (e.g., "https://xyz.supabase.co").'}),
            _jsx('li', { children: '`SUPABASE_ANON_KEY` is incorrect or is a service role key (must be the public "anon" key).'}),
            _jsx('li', { children: 'There are network issues preventing connection to Supabase.'})
        ]}),
        _jsx('p', { children: 'Please verify your Supabase Project URL and public Anon Key in `index.tsx` and check the browser console for more specific error messages (e.g., "CRITICAL CONFIGURATION ERROR" or "CRITICAL SECURITY RISK").' })
      ]
    });
  }

  if (authLoading) {
    return _jsx('div', { className: 'loading-indicator auth-loading-indicator', children: 'Verifying authentication status...' });
  }

  if (!currentUser) {
    return _jsxs('div', {
      className: 'auth-container',
      children: [
        _jsx('h1', { children: authView === 'login' ? 'Login to Dashboard' : 'Sign Up for Dashboard' }),
        _jsxs('form', {
          onSubmit: authView === 'login' ? handleLogin : handleSignup,
          className: 'auth-form',
          children: [
            _jsx('input', {
              type: 'email',
              value: authEmail,
              onChange: e => setAuthEmail(e.target.value),
              placeholder: 'Email Address',
              'aria-label': 'Email Address',
              required: true
            }),
            _jsx('input', {
              type: 'password',
              value: authPassword,
              onChange: e => setAuthPassword(e.target.value),
              placeholder: 'Password',
              'aria-label': 'Password',
              required: true
            }),
            _jsx('button', { type: 'submit', children: authView === 'login' ? 'Login' : 'Sign Up' }),
            authError && _jsx('p', { className: 'error-message auth-error', role: 'alert', children: authError }),
            globalError && _jsx('p', { className: 'error-message auth-error global-auth-error', role: 'alert', style: { whiteSpace: 'pre-wrap' }, children: globalError }),
            _jsxs('p', {
              className: 'auth-toggle',
              children: [
                authView === 'login' ? "Don't have an account? " : "Already have an account? ",
                _jsx('button', {
                  type: 'button',
                  onClick: () => { setAuthView(authView === 'login' ? 'signup' : 'login'); setAuthError(null); setGlobalError(null); setInitialSitesFetchFailedDueToMissingTable(false); setInitialWpFetchCompletedForSession(false); initialWpFetchCompletedForSessionRef.current = false; setAuthEmail(''); setAuthPassword(''); },
                  children: authView === 'login' ? 'Sign Up Here' : 'Login Here'
                })
              ]
            })
          ]
        })
      ]
    });
  }

  const canRefreshAll = sites.length > 0 && !isFetchingSites && !initialSitesFetchFailedDueToMissingTable && !editingSiteId;

  return _jsxs('div', {
    className: 'app-container',
    children: [
      _jsxs('header', {
        children: [
          _jsx('h1', {children: 'WordPress Site Dashboard'}),
          _jsxs('div', { className: 'header-user-info', children: [
             _jsx('button', {
                onClick: handleRefreshAllSites,
                className: 'refresh-all-button header-button',
                disabled: !canRefreshAll,
                title: canRefreshAll ? "Refresh data for all applicable sites" : "Cannot refresh all sites (e.g., no sites, initial data loading, or editing a site name)",
                children: 'Refresh All Sites 🔄'
             }),
            _jsxs('span', { children: ['Logged in as: ', _jsx('strong', { children: currentUser.email || currentUser.id }) ]}),
            _jsx('button', { onClick: handleLogout, className: 'logout-button header-button', children: 'Logout' }),
            _jsx('button', { onClick: handleShowAccountDeleteModal, className: 'delete-account-button header-button', children: 'Delete Account Data' })
          ]})
        ]
      }),
      globalError &&
        _jsx('p', {
          className: 'error-message global-error',
          role: 'alert',
          style: { whiteSpace: 'pre-wrap' }, 
          children: globalError,
        }),
      _jsxs('form', {
        onSubmit: handleAddSite,
        className: 'add-site-form',
        children: [
          _jsx('div', { className: 'form-grid', children: [
            _jsx('input', {
              type: 'text',
              value: newSiteName,
              onChange: e => setNewSiteName(e.target.value),
              placeholder: 'My Awesome Blog',
              'aria-label': 'Site Name',
              required: true,
              disabled: initialSitesFetchFailedDueToMissingTable
            }),
            _jsx('input', {
              type: 'url',
              value: newSiteUrl,
              onChange: e => setNewSiteUrl(e.target.value),
              placeholder: 'https://your-wordpress-site.com',
              'aria-label': 'Site URL',
              required: true,
              disabled: initialSitesFetchFailedDueToMissingTable
            }),
            _jsx('input', {
              type: 'text',
              value: newSiteWPUsername,
              onChange: e => setNewSiteWPUsername(e.target.value),
              placeholder: 'WordPress Username',
              'aria-label': 'WordPress Username',
              required: true,
              disabled: initialSitesFetchFailedDueToMissingTable
            }),
            _jsx('input', {
              type: 'password',
              value: newSiteAppPassword,
              onChange: e => setNewSiteAppPassword(e.target.value),
              placeholder: 'WordPress Application Password',
              'aria-label': 'WordPress Application Password',
              autoComplete: "new-password",
              required: true,
              disabled: initialSitesFetchFailedDueToMissingTable
            }),
          ]}),
          _jsx('button', {type: 'submit', disabled: initialSitesFetchFailedDueToMissingTable, children: 'Add Site'})
        ],
      }),
      isFetchingSites && !sites.length && !initialSitesFetchFailedDueToMissingTable &&
        _jsx('div', { className: 'loading-indicator sites-loading-indicator', children: 'Loading your sites from Supabase...'}),
      _jsx('div', {
        className: 'sites-grid',
        'aria-live': 'polite',
        children: sites.map(site =>
          _jsxs(
            'div',
            {
              className: `site-card ${site.isLoading ? 'site-loading' : ''} ${site.error ? 'site-error-state' : ''}`,
              children: [
                _jsxs('div', {
                  className: 'site-card-header',
                  children: [
                     editingSiteId === site.id ?
                        _jsxs('div', { className: 'site-name-edit-container', children: [
                            _jsx('input', {
                                type: 'text',
                                value: editingSiteNameInput,
                                onChange: (e: ChangeEvent<HTMLInputElement>) => setEditingSiteNameInput(e.target.value),
                                onKeyDown: (e) => { if (e.key === 'Enter') handleSaveSiteName(); if (e.key === 'Escape') handleCancelEditSiteName();},
                                className: 'site-name-edit-input',
                                'aria-label': `Edit name for ${site.name}`,
                                autoFocus: true
                            }),
                            siteEditError && _jsx('p', {className: 'error-message site-edit-error', role: 'alert', children: siteEditError})
                        ]}) :
                        _jsx('h2', {children: site.name}),
                    _jsxs('div', { className: 'site-card-actions', children: [
                        editingSiteId === site.id ?
                            
                            _jsxs(React.Fragment, { children: [
                                _jsx('button', { onClick: handleSaveSiteName, className: 'save-button site-action-button', title: 'Save name', 'aria-label': `Save new name for ${site.name}`, children: '💾' }),
                                _jsx('button', { onClick: handleCancelEditSiteName, className: 'cancel-button site-action-button', title: 'Cancel edit', 'aria-label': `Cancel editing name for ${site.name}`, children: '↩️' })
                            ]})
                        :
                            
                            _jsxs(React.Fragment, { children: [
                                _jsx('button', {
                                    onClick: () => handleStartEditSiteName(site),
                                    className: 'edit-button site-action-button',
                                    'aria-label': `Edit name for ${site.name}`,
                                    title: `Edit name for ${site.name}`,
                                    disabled: initialSitesFetchFailedDueToMissingTable || site.isLoading,
                                    children: '✏️'
                                }),
                                _jsx('button', {
                                    onClick: () => handleReloadSite(site.id),
                                    className: 'reload-button site-action-button',
                                    'aria-label': `Reload data for ${site.name}`,
                                    title: `Reload data for ${site.name}`,
                                    disabled: site.isLoading || !site.url || !site.wp_username || !site.wp_application_password || !isValidUrl(site.url) || initialSitesFetchFailedDueToMissingTable,
                                    children: '🔄'
                                }),
                                _jsx('button', {
                                  onClick: () => handleShowDeleteSiteModal(site),
                                  className: 'remove-button site-action-button',
                                  'aria-label': `Remove site ${site.name}`,
                                  title: `Remove site ${site.name}`,
                                  disabled: initialSitesFetchFailedDueToMissingTable,
                                  children: '×'
                                }),
                            ]})
                    ]})
                  ],
                }),
                _jsx('p', {
                  className: 'site-url-display',
                  children: _jsx('a', {
                    href: site.url,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    children: site.url,
                  }),
                }),
                 _jsx('p', {className: 'site-wp-user', children: `WP User: ${site.wp_username}`}),
                site.isLoading && editingSiteId !== site.id && 
                  _jsx('div', {
                    className: 'loading-indicator site-card-loading',
                    children: 'Loading WordPress post data...',
                  }),
                site.error && editingSiteId !== site.id &&
                  _jsx('p', {
                    className: 'error-message site-card-error',
                    role: 'alert',
                    style: { whiteSpace: 'pre-wrap' },
                    children: site.error,
                  }),
                !site.isLoading && !site.error && editingSiteId !== site.id &&
                  _jsxs('div', {
                    className: 'post-counts',
                    children: [
                      _jsxs('p', {
                        children: [
                          _jsx('strong', {children: 'Draft Posts:'}),
                          ' ',
                          site.drafts ?? 'N/A',
                        ],
                      }),
                      _jsxs('p', {
                        children: [
                          _jsx('strong', {children: 'Published Posts:'}),
                          ' ',
                          site.published ?? 'N/A',
                          site.published !== null && site.published > 0 && site.lastPublishedDate &&
                            _jsxs('span', { className: 'last-published-date', children: [
                                ' (Last: ',
                                formatDate(site.lastPublishedDate),
                                ')'
                            ]})
                        ],
                      }),
                    ],
                  }),
              ],
            },
            site.id
          )
        ),
      }),
      sites.length === 0 && !globalError && !isFetchingSites && currentUser && !initialSitesFetchFailedDueToMissingTable &&
        _jsx('p', {
          className: 'empty-state-message',
          children: 'No sites added yet. Add WordPress site details using the form above to get started!',
        }),

      showDeleteAccountModal &&
        _jsx('div', {
          className: 'modal-overlay',
          children: _jsxs('div', {
            className: 'modal-content',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'delete-account-title',
            children: [
              _jsx('h2', { id: 'delete-account-title', children: 'Delete Account Data Confirmation' }),
              _jsx('p', { children: 'This action is permanent and cannot be undone. All your saved sites for this account will be deleted from Supabase (if the "sites" table exists and is accessible).' }),
              _jsx('p', { children: 'To confirm, please type "delete" in the box below:'}),
              _jsx('input', {
                type: 'text',
                value: deleteAccountConfirmText,
                onChange: e => setDeleteAccountConfirmText(e.target.value),
                placeholder: 'delete',
                'aria-label': 'Type "delete" to confirm account data deletion',
                className: 'delete-confirm-input'
              }),
              globalError && _jsx('p', { className: 'error-message modal-error', role: 'alert', style: { whiteSpace: 'pre-wrap' }, children: globalError }),
              _jsxs('div', {
                className: 'modal-actions',
                children: [
                  _jsx('button', {
                    onClick: handleConfirmAccountDeletion,
                    disabled: deleteAccountConfirmText !== 'delete',
                    className: 'modal-button-delete',
                    children: 'Permanently Delete Account Data'
                  }),
                  _jsx('button', { onClick: handleCancelAccountDelete, className: 'modal-button-cancel', children: 'Cancel' })
                ]
              })
            ]
          })
        }),

      showDeleteSiteModal && siteToDelete &&
        _jsx('div', {
          className: 'modal-overlay',
          children: _jsxs('div', {
            className: 'modal-content',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'delete-site-title',
            children: [
              _jsxs('h2', { id: 'delete-site-title', children: ['Delete Site: ', _jsx('em', { children: siteToDelete.name })]}),
              _jsx('p', { children: 'This action is permanent and cannot be undone for this site. It will be removed from Supabase (if the "sites" table exists and is accessible).' }),
              _jsx('p', { children: 'To confirm, please type "delete" in the box below:'}),
              _jsx('input', {
                type: 'text',
                value: deleteSiteConfirmText,
                onChange: e => setDeleteSiteConfirmText(e.target.value),
                placeholder: 'delete',
                'aria-label': `Type "delete" to confirm deletion of site ${siteToDelete.name}`,
                className: 'delete-confirm-input'
              }),
              siteDeleteError && _jsx('p', { className: 'error-message modal-error', role: 'alert', style: { whiteSpace: 'pre-wrap' }, children: siteDeleteError }),
              _jsxs('div', {
                className: 'modal-actions',
                children: [
                  _jsx('button', {
                    onClick: handleConfirmSiteDeletion,
                    disabled: deleteSiteConfirmText !== 'delete' || initialSitesFetchFailedDueToMissingTable,
                    className: 'modal-button-delete',
                    children: 'Delete This Site'
                  }),
                  _jsx('button', { onClick: handleCancelSiteDeletion, className: 'modal-button-cancel', children: 'Cancel' })
                ]
              })
            ]
          })
        }),
      _jsx('footer', {
        className: 'app-footer',
        children: 'Developer by Rejaul Karim ❤'
      })
    ],
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(_jsx(App, {}));
}
