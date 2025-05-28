/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// Fix: Import React to use React.Fragment
import React, {useState, FormEvent, useEffect, useCallback, ChangeEvent, useMemo} from 'react';
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
  lastPublishedUrl: string | null; 
  isLoading: boolean;
  error: string | null;
  lastRefreshedAt: number | null; // Timestamp of the last successful WordPress data refresh
}

type DraftFilterOperator = 'exact' | 'gt' | 'lt' | '';


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

  // Filter State
  const [showFilters, setShowFilters] = useState(false);
  const [filterLastPublishedAfter, setFilterLastPublishedAfter] = useState(''); // YYYY-MM-DD
  const [filterLastPublishedBefore, setFilterLastPublishedBefore] = useState(''); // YYYY-MM-DD
  const [filterDraftsOperator, setFilterDraftsOperator] = useState<DraftFilterOperator>('');
  const [filterDraftsCount, setFilterDraftsCount] = useState(''); // Store as string, parse to number


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
      }
      setCurrentUser(user);
      activeUser = user; // Keep track of the current user for comparison
      setAuthLoading(false);
      if (!user) {
        setSites([]); // Clear sites if user logs out
        setEditingSiteId(null); // Clear any editing state on logout
      }
    });

    // Check initial session
     supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      activeUser = user;
      setAuthLoading(false);
      if (!user) {
        setInitialSitesFetchFailedDueToMissingTable(false); // Reset if no user initially
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
        {headers}
      );
      if (!draftResponse.ok) throw new Error(`Drafts: HTTP ${draftResponse.status} ${draftResponse.statusText}`);
      const draftCount = parseInt(draftResponse.headers.get('X-WP-Total') || '0', 10);

      const publishedResponse = await fetch(
        `${siteUrl}/wp-json/wp/v2/posts?status=publish&per_page=1&orderby=date&order=desc${cacheBust}`,
        {headers}
      );
      if (!publishedResponse.ok) throw new Error(`Published: HTTP ${publishedResponse.status} ${publishedResponse.statusText}`);
      const publishedCount = parseInt(publishedResponse.headers.get('X-WP-Total') || '0', 10);

      let lastPublishedPostDate: string | null = null;
      let lastPublishedPostUrl: string | null = null;

      if (publishedCount > 0) {
        const publishedPostsData = await publishedResponse.json();
        if (publishedPostsData && publishedPostsData.length > 0) {
            const latestPost = publishedPostsData[0];
            if (latestPost.date_gmt) { // Prefer GMT date for consistent timezone handling
                lastPublishedPostDate = latestPost.date_gmt;
            } else if (latestPost.date) { // Fallback to 'date' if 'date_gmt' is not available
                lastPublishedPostDate = latestPost.date;
            }
            if (latestPost.link) { 
                lastPublishedPostUrl = latestPost.link;
            }
        }
      }

      setSites(prevSites =>
        prevSites.map(site =>
          site.id === siteId
            ? { ...site, isLoading: false, drafts: draftCount, published: publishedCount, lastPublishedDate: lastPublishedPostDate, lastPublishedUrl: lastPublishedPostUrl, error: null, lastRefreshedAt: Date.now() }
            : site
        )
      );
    } catch (error: any) {
      console.error("Fetch error for WordPress site", siteUrl, error);
      let errorMessage = `WordPress API Error: ${error.message}. Ensure REST API is active, CORS is configured, and credentials are correct.`;
      if (error.message && typeof error.message === 'string' && error.message.toLowerCase().includes('failed to fetch')) {
        errorMessage = `Network Error: Unable to connect to WordPress site at ${siteUrl}.\nThis could be due to:\n` +
                       `1. Internet Connection: Please check your network connection.\n` +
                       `2. WordPress Site Status: The site might be down or unreachable.\n` +
                       `3. CORS Policy on WordPress: The WordPress site must allow requests from this app's origin (${window.location.origin}). This often requires server-level configuration (e.g., in .htaccess or via a plugin).\n` +
                       `4. WordPress REST API: Ensure the REST API is enabled and accessible on the WordPress site.\n` +
                       `5. Security Plugins/Firewalls: These on the WordPress site might be blocking the request.\n` +
                       `Raw error: ${error.message}`;
      }
      setSites(prevSites =>
        prevSites.map(site =>
          site.id === siteId
            ? { ...site, isLoading: false, error: errorMessage } // Do not update lastRefreshedAt on error
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
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching sites from Supabase. Raw error object:', error);
        const pgError = error as PostgrestError;
        let userErrorMessage = `Failed to load sites: ${pgError.message}. Check console for details.`;

        if (pgError.code === '42P01') {
          userErrorMessage = "Critical Error: The 'sites' table does not exist in your Supabase database. Please create it according to the documentation/instructions. You may need to log out and log back in after creating the table.";
          setInitialSitesFetchFailedDueToMissingTable(true);
        } else if (pgError.message && pgError.message.toLowerCase().includes('failed to fetch')) {
            userErrorMessage = `Network Error: Unable to connect to Supabase. This could be due to:\n` +
                               `1. Internet Connection: Please check your network connection.\n` +
                               `2. CORS Policy: Ensure your Supabase project allows requests from this app's origin (${window.location.origin}). Verify settings in Supabase Dashboard > Authentication > URL Configuration > Allowed Origins.\n` +
                               `3. Ad Blockers/Firewalls: Browser extensions or firewalls might be blocking the request.\n` +
                               `4. Supabase Service Status: Check if Supabase services are operational (e.g., status.supabase.com).\n` +
                               `Please verify these and try again. Raw error: ${pgError.details || pgError.message}`;
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
        const sitesWithClientState: SiteClientState[] = data.map((siteCore: SiteCore) => ({
          ...siteCore,
          drafts: null,
          published: null,
          lastPublishedDate: null,
          lastPublishedUrl: null, 
          isLoading: false, 
          error: "WordPress data not loaded. Click reload or 'Refresh All Sites'.", 
          lastRefreshedAt: null, // Initialize lastRefreshedAt
        }));
        setSites(sitesWithClientState);
      }
    } catch (e: any) {
        console.error("Unexpected error during fetchUserSites:", e);
        setGlobalError(`An unexpected error occurred while fetching sites: ${e.message || 'Unknown error'}`);
        setSites([]);
    } finally {
      setIsFetchingSites(false);
    }
  }, [currentUser, initialSitesFetchFailedDueToMissingTable, isFetchingSites]);


  useEffect(() => {
    if (currentUser?.id && supabase && !initialSitesFetchFailedDueToMissingTable) {
        fetchUserSites();
    } else if (!currentUser) {
        setSites([]);
        if (isFetchingSites) setIsFetchingSites(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, supabase, initialSitesFetchFailedDueToMissingTable]); // Removed fetchUserSites from dep array to avoid potential loops if it wasn't stable, relying on other deps to trigger it.


  // Auto-refresh useEffect
  useEffect(() => {
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

    if (!currentUser || !sites.length || initialSitesFetchFailedDueToMissingTable) {
      return; // Don't run if not logged in, no sites, or table missing
    }

    let intervalId: NodeJS.Timeout | undefined = undefined;

    const checkForRefresh = () => {
      // console.log("Auto-refresh check running at:", new Date().toLocaleTimeString());
      const now = Date.now();
      sites.forEach(site => {
        // Skip if site is currently being name-edited, already loading, or critical DB error
        if (editingSiteId === site.id || site.isLoading) {
          return;
        }

        // Treat null lastRefreshedAt as needing refresh immediately
        const timeSinceLastRefresh = site.lastRefreshedAt ? now - site.lastRefreshedAt : TWELVE_HOURS_MS;

        if (
          timeSinceLastRefresh >= TWELVE_HOURS_MS &&
          site.url &&
          site.wp_username &&
          site.wp_application_password
        ) {
          // console.log(`Auto-refresh triggered for site: ${site.name} (ID: ${site.id}) at ${new Date().toLocaleTimeString()}`);
          fetchSiteDataWordPress(site.id, site.url, site.wp_username, site.wp_application_password);
        }
      });
    };

    // Perform an initial check shortly after sites are loaded or dependencies change.
    const initialCheckTimeoutId = setTimeout(checkForRefresh, 2000); // 2 seconds delay

    intervalId = setInterval(checkForRefresh, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialCheckTimeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
      // console.log("Auto-refresh interval cleared at:", new Date().toLocaleTimeString());
    };
  }, [sites, currentUser, fetchSiteDataWordPress, editingSiteId, initialSitesFetchFailedDueToMissingTable]);


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
           userErrorMessage = `Network Error: Unable to connect to Supabase to add site. This could be due to:\n` +
                               `1. Internet Connection: Please check your network connection.\n` +
                               `2. CORS Policy: Ensure your Supabase project allows requests from this app's origin (${window.location.origin}). Verify settings in Supabase Dashboard > Authentication > URL Configuration > Allowed Origins.\n` +
                               `3. Ad Blockers/Firewalls: Browser extensions or firewalls might be blocking the request.\n` +
                               `4. Supabase Service Status: Check Supabase status pages.\n` +
                               `Raw error: ${pgError.details || pgError.message}`;
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
        lastPublishedUrl: null, 
        isLoading: true, 
        error: null,
        lastRefreshedAt: null, // Initialize for new site
      };
      setSites(prevSites => [...prevSites, newSiteClientState]);
      setNewSiteName('');
      setNewSiteUrl('');
      setNewSiteWPUsername('');
      setNewSiteAppPassword('');
      if (newSiteClientState.wp_application_password) {
        // This fetch will set lastRefreshedAt on success
        await fetchSiteDataWordPress(newSiteClientState.id, newSiteClientState.url, newSiteClientState.wp_username, newSiteClientState.wp_application_password);
      } else {
         setSites(prev => prev.map(s => s.id === newSiteClientState.id ? {...s, isLoading: false, error: "Application password missing, cannot fetch WordPress data."} : s));
      }
    }
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString); // Assuming dateString is a UTC string from WP API (e.g., date_gmt)

      // Get date part in Asia/Dhaka timezone, formatted as YYYY/MM/DD
      const dateOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Dhaka',
      };
      // 'en-CA' locale often gives YYYY-MM-DD format.
      const formattedDatePart = new Intl.DateTimeFormat('en-CA', dateOptions)
                                    .format(date)
                                    .replace(/-/g, '/'); // Replace hyphens with slashes

      // Get time part in Asia/Dhaka timezone, formatted as h:mm AM/PM
      const timeOptions: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Dhaka',
      };
      // 'en-US' locale is common for 12-hour AM/PM format.
      const formattedTimePart = new Intl.DateTimeFormat('en-US', timeOptions).format(date);

      return `${formattedDatePart} at ${formattedTimePart}`;
    } catch (e) {
      console.error("Error formatting date:", dateString, e);
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
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Email and password are required.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
    });
    if (error) {
      let errorMessage = error.message;
       if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
           errorMessage = `Network Error: Signup failed. Unable to connect to Supabase.\n` +
                          `Please check your internet connection and try again. If the issue persists, ensure this app's origin (${window.location.origin}) is allowed in your Supabase project's CORS settings and that Supabase services are operational.`;
       }
      setAuthError(errorMessage);
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });
    if (error) {
      let errorMessage = error.message;
       if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
           errorMessage = `Network Error: Login failed. Unable to connect to Supabase.\n` +
                          `Please check your internet connection and try again. If the issue persists, ensure this app's origin (${window.location.origin}) is allowed in your Supabase project's CORS settings and that Supabase services are operational.`;
       }
      setAuthError(errorMessage);
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
    setEditingSiteId(null); 
    const { error } = await supabase.auth.signOut();
    if (error) {
       let errorMessage = `Logout failed: ${error.message}`;
       if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
           errorMessage = `Network Error: Logout failed. Unable to connect to Supabase.\n` +
                          `Please check your internet connection. If the issue persists, Supabase services might be temporarily unavailable.`;
       }
      setGlobalError(errorMessage);
    } else {
      setCurrentUser(null);
      setSites([]);
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
        setGlobalError("Supabase is not configured. Cannot delete account data.");
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
            userErrorMessage = `Network Error: Failed to delete site data from Supabase. This could be due to:\n` +
                               `1. Internet Connection or Supabase Service Status.\n` +
                               `2. CORS Policy: Check Supabase Dashboard for origin (${window.location.origin}).\n` +
                               `3. Ad Blockers/Firewalls.\n` +
                               `Raw error: ${pgError.details || pgError.message}`;
          }
          setGlobalError(userErrorMessage); 
          return;
        }
    }

    await handleLogout(); 
    handleCancelAccountDelete(); 
    setTimeout(() => setGlobalError("All your site data (if the 'sites' table existed) has been deleted and you have been logged out. To fully delete your user account, contact support or use Supabase admin tools."), 0);
  };


  // --- Site Delete Handlers ---
  const handleShowDeleteSiteModal = (siteToDel: SiteClientState) => {
    if (editingSiteId === siteToDel.id) handleCancelEditSiteName(); 
    setSiteToDelete(siteToDel);
    setSiteDeleteError(null);
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
        setSiteDeleteError("Supabase is not configured. Cannot delete site.");
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
            userErrorMessage = `Network Error: Failed to delete site from Supabase. This could be due to:\n` +
                               `1. Internet Connection or Supabase Service Status.\n` +
                               `2. CORS Policy: Check Supabase Dashboard for origin (${window.location.origin}).\n` +
                               `3. Ad Blockers/Firewalls.\n` +
                               `Raw error: ${pgError.details || pgError.message}`;
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

    if (!siteToReload.url || !siteToReload.wp_username || !siteToReload.wp_application_password) {
        setSites(prevSites =>
            prevSites.map(s =>
                s.id === siteId ? { ...s, isLoading: false, error: "Cannot reload: Missing URL, WordPress username, or application password." } : s
            )
        );
        return;
    }
    // This fetch will update lastRefreshedAt on success
    await fetchSiteDataWordPress(siteToReload.id, siteToReload.url, siteToReload.wp_username, siteToReload.wp_application_password);
  }, [sites, fetchSiteDataWordPress, editingSiteId]);


  // --- Site Name Edit Handlers ---
  const handleStartEditSiteName = (site: SiteClientState) => {
    setEditingSiteId(site.id);
    setEditingSiteNameInput(site.name);
    setSiteEditError(null); 
  };

  const handleCancelEditSiteName = () => {
    setEditingSiteId(null);
    setEditingSiteNameInput('');
    setSiteEditError(null);
  };

  const handleSaveSiteName = async () => {
    if (!editingSiteId || !editingSiteNameInput.trim()) {
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
           userErrorMessage = `Network Error: Failed to update site name in Supabase. This could be due to:\n` +
                               `1. Internet Connection or Supabase Service Status.\n` +
                               `2. CORS Policy: Check Supabase Dashboard for origin (${window.location.origin}).\n` +
                               `3. Ad Blockers/Firewalls.\n` +
                               `Raw error: ${pgError.details || pgError.message}`;
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
    if (!sites.length) {
        setGlobalError("No sites to refresh.");
        return;
    }
    setGlobalError(null);
    let refreshableSiteFound = false;
    for (const site of sites) {
        // Also ensure site is not being edited
        if (site.url && site.wp_username && site.wp_application_password && !site.isLoading && editingSiteId !== site.id) {
            refreshableSiteFound = true;
            // This fetch will update lastRefreshedAt on success
            fetchSiteDataWordPress(site.id, site.url, site.wp_username, site.wp_application_password);
        }
    }
    if (!refreshableSiteFound) {
        setGlobalError("No sites could be refreshed (e.g., missing credentials, already loading, or a site is being edited).");
    }
  };

  // --- Filter Handlers ---
  const handleToggleFilters = () => {
    setShowFilters(prev => !prev);
  };

  const handleResetFilters = () => {
    setFilterLastPublishedAfter('');
    setFilterLastPublishedBefore('');
    setFilterDraftsOperator('');
    setFilterDraftsCount('');
    setShowFilters(false); // Optionally hide panel on reset
  };

  const filteredSites = useMemo(() => {
    let currentSites = [...sites];

    // Date Filtering
    if (filterLastPublishedAfter) {
      const afterDate = new Date(filterLastPublishedAfter + "T00:00:00.000Z"); // Treat as UTC start of day
      currentSites = currentSites.filter(site => {
        if (!site.lastPublishedDate) return false;
        const siteDate = new Date(site.lastPublishedDate); // This is already UTC
        return siteDate.getTime() >= afterDate.getTime();
      });
    }
    if (filterLastPublishedBefore) {
      const beforeDate = new Date(filterLastPublishedBefore + "T23:59:59.999Z"); // Treat as UTC end of day
      currentSites = currentSites.filter(site => {
        if (!site.lastPublishedDate) return false;
        const siteDate = new Date(site.lastPublishedDate); // This is already UTC
        return siteDate.getTime() <= beforeDate.getTime();
      });
    }

    // Drafts Filtering
    if (filterDraftsOperator && filterDraftsCount !== '') {
      const count = parseInt(filterDraftsCount, 10);
      if (!isNaN(count)) {
        currentSites = currentSites.filter(site => {
          if (site.drafts === null) return false; // Don't match if drafts count is unknown
          switch (filterDraftsOperator) {
            case 'exact': return site.drafts === count;
            case 'gt': return site.drafts > count;
            case 'lt': return site.drafts < count;
            default: return true;
          }
        });
      }
    }
    return currentSites;
  }, [sites, filterLastPublishedAfter, filterLastPublishedBefore, filterDraftsOperator, filterDraftsCount]);



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
    return _jsx('div', { className: 'loading-indicator', children: 'Loading authentication...' });
  }

  if (!currentUser) {
    return _jsxs('div', {
      className: 'auth-container',
      children: [
        _jsx('h1', { children: authView === 'login' ? 'Login' : 'Sign Up' }),
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
            authError && _jsx('p', { className: 'error-message auth-error', role: 'alert', style: { whiteSpace: 'pre-wrap' }, children: authError }),
            globalError && _jsx('p', { className: 'error-message auth-error', role: 'alert', style: { whiteSpace: 'pre-wrap' }, children: globalError }),
            _jsxs('p', {
              className: 'auth-toggle',
              children: [
                authView === 'login' ? "Don't have an account? " : "Already have an account? ",
                _jsx('button', {
                  type: 'button',
                  onClick: () => { setAuthView(authView === 'login' ? 'signup' : 'login'); setAuthError(null); setGlobalError(null); setInitialSitesFetchFailedDueToMissingTable(false); },
                  children: authView === 'login' ? 'Sign Up' : 'Login'
                })
              ]
            }),
             _jsx('p', { className: 'warning-message', children: 'Data is stored using Supabase. Ensure your Supabase project is set up correctly with Row Level Security, and the "sites" table exists.'})
          ]
        })
      ]
    });
  }

  const canRefreshAll = sites.length > 0 && !isFetchingSites && !initialSitesFetchFailedDueToMissingTable && !editingSiteId && !sites.some(s => s.isLoading);

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
                title: canRefreshAll ? "Refresh data for all sites" : "Cannot refresh all sites (e.g., no sites, a site is loading, or a site is being edited)",
                children: 'Refresh All Sites 🔄'
             }),
            _jsxs('span', { children: ['Logged in as: ', _jsx('strong', { children: currentUser.email || currentUser.id }) ]}),
            _jsx('button', { onClick: handleLogout, className: 'logout-button header-button', children: 'Logout' }),
            _jsx('button', { onClick: handleShowAccountDeleteModal, className: 'delete-account-button header-button', children: 'Delete Account Data' })
          ]})
        ]
      }),
      globalError && !showDeleteAccountModal && !siteDeleteError && 
        _jsx('p', {
          className: 'error-message global-error',
          role: 'alert',
          style: { whiteSpace: 'pre-wrap' }, 
          children: globalError,
        }),

      _jsxs('div', { className: 'controls-area', children: [
        _jsx('button', {
            onClick: handleToggleFilters,
            className: 'toggle-filters-button',
            children: showFilters ? 'Hide Filters 🔼' : 'Show Filters 🔽'
        }),
        showFilters && _jsxs('div', { className: 'filter-panel', children: [
            _jsx('h3', {children: 'Filter Sites'}),
            _jsxs('div', { className: 'filter-group date-filter-group', children: [
                _jsx('label', {htmlFor: 'filter-published-after', children: 'Last Published After:'}),
                _jsx('input', {
                    type: 'date',
                    id: 'filter-published-after',
                    value: filterLastPublishedAfter,
                    onChange: e => setFilterLastPublishedAfter(e.target.value),
                    'aria-label': 'Filter by Last published date after'
                }),
                _jsx('label', {htmlFor: 'filter-published-before', children: 'Last Published Before:'}),
                _jsx('input', {
                    type: 'date',
                    id: 'filter-published-before',
                    value: filterLastPublishedBefore,
                    onChange: e => setFilterLastPublishedBefore(e.target.value),
                    'aria-label': 'Filter by Last published date before'
                })
            ]}),
            _jsxs('div', { className: 'filter-group drafts-filter-group', children: [
                 _jsx('label', {htmlFor: 'filter-drafts-operator', children: 'Draft Posts:'}),
                _jsxs('select', {
                    id: 'filter-drafts-operator',
                    value: filterDraftsOperator,
                    onChange: e => setFilterDraftsOperator(e.target.value as DraftFilterOperator),
                    'aria-label': 'Drafts filter operator',
                    children: [
                        _jsx('option', {value: '', children: 'Any Count'}),
                        _jsx('option', {value: 'exact', children: 'Exactly'}),
                        _jsx('option', {value: 'gt', children: 'More than'}),
                        _jsx('option', {value: 'lt', children: 'Less than'})
                    ]
                }),
                _jsx('input', {
                    type: 'number',
                    min: '0',
                    value: filterDraftsCount,
                    onChange: e => setFilterDraftsCount(e.target.value),
                    placeholder: 'Count',
                    'aria-label': 'Drafts filter count',
                    disabled: !filterDraftsOperator
                })
            ]}),
            _jsx('button', {onClick: handleResetFilters, className: 'reset-filters-button', children: 'Reset Filters & Hide'})
        ]}),
      ]}),
      
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
          _jsx('button', {type: 'submit', disabled: initialSitesFetchFailedDueToMissingTable, children: 'Add Site'}),
            _jsx('p', { className: 'warning-message storage-warning', children: 'WordPress Application Passwords are sent to Supabase. Review Supabase security for sensitive data.'})
        ],
      }),
      isFetchingSites && !sites.length && !initialSitesFetchFailedDueToMissingTable &&
        _jsx('div', { className: 'loading-indicator', children: 'Loading your sites from Supabase...'}),
      _jsx('div', {
        className: 'sites-grid',
        'aria-live': 'polite',
        children: filteredSites.map(site =>
          _jsxs(
            'div',
            {
              className: 'site-card',
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
                            siteEditError && _jsx('p', {className: 'error-message site-edit-error', style: { whiteSpace: 'pre-wrap' }, children: siteEditError})
                        ]}) :
                        _jsx('h2', {children: site.name}),
                    _jsxs('div', { className: 'site-card-actions', children: [
                        editingSiteId === site.id ?
                            _jsxs(React.Fragment, { children: [
                                _jsx('button', { onClick: handleSaveSiteName, className: 'save-button site-action-button', title: 'Save name', children: '💾' }),
                                _jsx('button', { onClick: handleCancelEditSiteName, className: 'cancel-button site-action-button', title: 'Cancel edit', children: '↩️' })
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
                                    disabled: site.isLoading || !site.url || !site.wp_username || !site.wp_application_password || initialSitesFetchFailedDueToMissingTable,
                                    children: '🔄'
                                }),
                                _jsx('button', {
                                  onClick: () => handleShowDeleteSiteModal(site),
                                  className: 'remove-button site-action-button',
                                  'aria-label': `Remove ${site.name}`,
                                  title: `Remove ${site.name}`,
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
                 _jsx('p', {style: {fontSize: '0.8em', color: '#555'}, children: `WP User: ${site.wp_username}`}),
                site.isLoading && editingSiteId !== site.id && 
                  _jsx('div', {
                    className: 'loading-indicator',
                    children: 'Loading WordPress post data...',
                  }),
                site.error && editingSiteId !== site.id &&
                  _jsx('p', {
                    className: 'error-message',
                    role: 'alert',
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
                        ],
                      }),
                      (site.published !== null && site.published > 0) && _jsxs(React.Fragment, { children: [
                          _jsxs('p', {
                            children: [
                              _jsx('strong', {children: 'Last Published:'}),
                              ' ',
                              formatDate(site.lastPublishedDate),
                            ],
                          }),
                          _jsxs('p', {
                            className: 'last-published-url-wrapper', 
                            children: [
                              _jsx('strong', {children: 'Last Post URL:'}), 
                              ' ',
                              site.lastPublishedUrl ? 
                                _jsx('a', { href: site.lastPublishedUrl, target: '_blank', rel: 'noopener noreferrer', children: site.lastPublishedUrl }) 
                                : 'N/A',
                            ],
                          }),
                      ]})
                    ],
                  }),
              ],
            },
            site.id
          )
        ),
      }),
      sites.length > 0 && filteredSites.length === 0 && !globalError && !isFetchingSites && currentUser && !initialSitesFetchFailedDueToMissingTable &&
        _jsx('p', {
          className: 'empty-state-message',
          children: 'No sites match your current filters. Try adjusting or clearing your filters.',
        }),
      sites.length === 0 && !globalError && !isFetchingSites && currentUser && !initialSitesFetchFailedDueToMissingTable &&
        _jsx('p', {
          className: 'empty-state-message',
          children: 'No sites added yet. Add WordPress site details above to get started!',
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
              globalError && _jsx('p', { className: 'error-message modal-error', children: globalError }), 
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
              siteDeleteError && _jsx('p', { className: 'error-message modal-error', children: siteDeleteError }), 
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
        })
    ],
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(_jsx(App, {}));
}