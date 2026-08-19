/**
 * Service d'authentification OAuth pour Météo France
 * Gère le renouvellement automatique du token toutes les heures
 */

const OAUTH_URL = '/mf-token';
const TOKEN_DURATION = 3600; // 1 heure en secondes

const MASTER_TOKEN = "eyJ4NXQiOiJZV0kxTTJZNE1qWTNOemsyTkRZeU5XTTRPV014TXpjek1UVmhNbU14T1RSa09ETXlOVEE0Tnc9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJHcmVnNTk4ODBAY2FyYm9uLnN1cGVyIiwiYXBwbGljYXRpb24iOnsib3duZXIiOiJHcmVnNTk4ODAiLCJ0aWVyUXVvdGFUeXBlIjpudWxsLCJ0aWVyIjoiVW5saW1pdGVkIiwibmFtZSI6IkRlZmF1bHRBcHBsaWNhdGlvbiIsImlkIjoyMzg0MCwidXVpZCI6IjA3YTRhZjk0LWE4MzktNDllZC05MjJlLTAyZDMyMTM1ZjVlZSJ9LCJpc3MiOiJodHRwczpcL1wvcG9ydGFpbC1hcGkubWV0ZW9mcmFuY2UuZnI6NDQzXC9vYXV0aDJcL3Rva2VuIiwidGllckluZm8iOnsiNTBQZXJNaW4iOnsidGllclF1b3RhVHlwZSI6InJlcXVlc3RDb3VudCIsImdyYXBoUUxNYXhDb21wbGV4aXR5IjowLCJncmFwaFFMTWF4RGVwdGgiOjAsInN0b3BPblF1b3RhUmVhY2giOnRydWUsInNwaWtlQXJyZXN0TGltaXQiOjAsInNwaWtlQXJyZXN0VW5pdCI6InNlYyJ9LCI2MFJlcVBhck1pbiI6eyJ0aWVyUXVvdGFUeXBlIjoicmVxdWVzdENvdW50IiwiZ3JhcGhRTE1heENvbXBsZXhpdHkiOjAsImdyYXBoUUxNYXhEZXB0aCI6MCwic3RvcE9uUXVvdGFSZWFjaCI6dHJ1ZSwic3Bpa2VBcnJlc3RMaW1pdCI6MCwic3Bpa2VBcnJlc3RVbml0Ijoic2VjIn19LCJrZXl0eXBlIjoiUFJPRFVDVElPTiIsInN1YnNjcmliZWRBUElzIjpbeyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkFST01FIiwiY29udGV4dCI6IlwvcHVibGljXC9hcm9tZVwvMS4wIiwicHVibGlzaGVyIjoiYWRtaW5fbWYiLCJ2ZXJzaW9uIjoiMS4wIiwic3Vic2NyaXB0aW9uVGllciI6IjUwUGVyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNWaWdpbGFuY2UiLCJjb250ZXh0IjoiXC9wdWJsaWNcL0RQVmlnaWxhbmNlXC92MSIsInB1Ymxpc2hlciI6ImFkbWluIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjYwUmVxUGFyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNPYnNlcnZhdGlvbiIsImNvbnRleHQiOiJcL3B1YmxpY1wvRFBPYnNcL3YyIiwicHVibGlzaGVyIjoiYmFzdGllbmciLCJ2ZXJzaW9uIjoidjIiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc1BhcXVldFJhZGFyIiwiY29udGV4dCI6IlwvcHVibGljXC9EUFBhcXVldFJhZGFyXC92MSIsInB1Ymxpc2hlciI6ImxvaWMubWFydGluIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjUwUGVyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNQYXF1ZXRPYnNlcnZhdGlvbiIsImNvbnRleHQiOiJcL3B1YmxpY1wvRFBQYXF1ZXRPYnNcL3YxIiwicHVibGlzaGVyIjoiYmFzdGllbmciLCJ2ZXJzaW9uIjoidjEiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc09ic2VydmF0aW9uIiwiY29udGV4dCI6IlwvcHVibGljXC9EUE9ic1wvdjEiLCJwdWJsaXNoZXIiOiJiYXN0aWVuZyIsInZlcnNpb24iOiJ2MSIsInN1YnNjcmliZWRBUElzIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc0NsaW1hdG9sb2dpZSIsImNvbnRleHQiOiJcL3B1YmxpY1wvRFBDbGltXC92MSIsInB1Ymxpc2hlciI6ImFkbWluX21mIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjUwUGVyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNQYXF1ZXRPYnNlcnZhdGlvbiIsImNvbnRleHQiOiJcL3B1YmxpY1wvRFBQYXF1ZXRPYnNcL3YyIiwicHVibGlzaGVyIjoiYmFzdGllbmciLCJ2ZXJzaW9uIjoidjIiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc01ldGVvRm9yZXRzIiwiY29udGV4dCI6IlwvcHVibGljXC9EUE1ldGVvRm9yZXRzXC92MSIsInB1Ymxpc2hlciI6Im11cmllbC5hdWJpbiIsInZlcnNpb24iOiJ2MSIsInN1YnNjcmliZWRBUElzIjoiNTBQZXJNaW4ifV0sImV4cCI6MTgxNjA2NDM1MSwidG9rZW5fdHlwZSI6ImFwaUtleSIsImlhdCI6MTc4NzEzNzM1MSwianRpIjoiY2MyMTI2ZWEtZjY1Mi00ZWE3LTlhZTMtOTkxNGZmYTk4MDAxIn0=.hU5FYqUJW0p2XfcvvDUxkT5qZ2QQDa07qUW06e3wLC_BHDF6FNDRLH3_frZ4WVgc72o9v16pnICAu3bhOBRWTLJHgDm-EWFcybefl8NhcNZboa0Yram9qYQKPbPyhyVXD_sXBF-nKXdRq5ybHWJu_3iG35XaiVEWo0sBRHAgHE735PqGi9gZ5FfNuxOHq7u2yr0eaxdUb6AjnWCeFeWO3n_uV0h4J1WnBvHfbWQCsc6SkvrteWkKZnfOhBKSgCMJc0lkIxeaQOZ-zPdYDwUClQ1S-RWJQQrBNqQl-qWAaA4vk7MSb-BIABcsz6wM429cbmxSC_Djhzuc3JNNWMFbcA==";

class MeteoFranceAuth {
    constructor() {
        this.currentToken = null;
        this.tokenExpiry = null;
        this.refreshTimer = null;
        this.consumerKey = 'Mhar9YSs8LEluq4neXqP0YeHaaka';
        this.consumerSecret = 'nDKPWzVr2_2o5Ej1aPZa7O6hu4Ia';
    }

    /**
     * Initialiser avec les credentials
     */
    initialize(consumerKey, consumerSecret) {
        if (consumerKey) this.consumerKey = consumerKey;
        if (consumerSecret) this.consumerSecret = consumerSecret;
        console.log('[MeteoAuth] 🔑 Credentials configurés');
    }

    /**
     * Obtenir un token valide (génère ou utilise le cache)
     */
    async getValidToken() {
        // Si token existe et n'est pas expiré
        if (this.currentToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            const remainingMinutes = Math.floor((this.tokenExpiry - Date.now()) / 60000);
            console.log(`[MeteoAuth] ✅ Token valide (expire dans ${remainingMinutes} min)`);
            return this.currentToken;
        }

        // Sinon, générer un nouveau token
        console.log('[MeteoAuth] 🔄 Génération d\'un nouveau token...');
        return await this.generateToken();
    }

    /**
     * Générer un nouveau token OAuth
     */
    async generateToken() {
        try {
            // 1. Essayer la fonction serverless Vercel /api/mf-token (sans risque de popup Basic Auth)
            try {
                const apiResp = await fetch('/api/mf-token', { method: 'POST' });
                if (apiResp.ok) {
                    const apiData = await apiResp.json();
                    if (apiData.access_token) {
                        this.currentToken = apiData.access_token;
                        this.tokenExpiry = Date.now() + (apiData.expires_in * 1000);
                        this.scheduleRefresh(apiData.expires_in - 300);
                        return this.currentToken;
                    }
                }
            } catch (e) {
                console.warn('[MeteoAuth] /api/mf-token non disponible, fallback direct');
            }

            // 2. Fallback direct avec credentials
            const key = this.consumerKey || 'Mhar9YSs8LEluq4neXqP0YeHaaka';
            const sec = this.consumerSecret || 'nDKPWzVr2_2o5Ej1aPZa7O6hu4Ia';
            const credentials = btoa(`${key}:${sec}`);

            const response = await fetch('/mf-token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OAuth failed: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            this.currentToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            const expiryDate = new Date(this.tokenExpiry);
            console.log(`[MeteoAuth] ✅ Nouveau token généré`);
            console.log(`[MeteoAuth] ⏰ Expire à: ${expiryDate.toLocaleTimeString('fr-FR')}`);

            this.scheduleRefresh(data.expires_in - 300);
            return this.currentToken;

        } catch (error) {
            console.error('[MeteoAuth] ❌ Erreur génération token:', error);
            throw error;
        }
    }

    /**
     * Programmer le renouvellement automatique du token
     */
    scheduleRefresh(delaySeconds) {
        // Annuler le timer précédent
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        const delayMs = delaySeconds * 1000;
        const refreshDate = new Date(Date.now() + delayMs);

        console.log(`[MeteoAuth] ⏱️ Renouvellement programmé à: ${refreshDate.toLocaleTimeString('fr-FR')}`);

        this.refreshTimer = setTimeout(async () => {
            console.log('[MeteoAuth] 🔄 Renouvellement automatique du token...');
            try {
                await this.generateToken();
            } catch (error) {
                console.error('[MeteoAuth] ❌ Erreur renouvellement auto:', error);
                // Réessayer dans 1 minute
                this.scheduleRefresh(60);
            }
        }, delayMs);
    }

    /**
     * Forcer le renouvellement du token
     */
    async forceRefresh() {
        console.log('[MeteoAuth] 🔄 Renouvellement forcé du token...');
        this.currentToken = null;
        this.tokenExpiry = null;
        return await this.generateToken();
    }

    /**
     * Arrêter le renouvellement automatique
     */
    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
            console.log('[MeteoAuth] ⏸️ Renouvellement automatique arrêté');
        }
    }

    /**
     * Obtenir les informations du token actuel
     */
    getTokenInfo() {
        if (!this.currentToken) {
            return { valid: false, message: 'Aucun token' };
        }

        const now = Date.now();
        const isValid = this.tokenExpiry && now < this.tokenExpiry;
        const remainingMs = this.tokenExpiry ? this.tokenExpiry - now : 0;
        const remainingMinutes = Math.floor(remainingMs / 60000);

        return {
            valid: isValid,
            expiresAt: this.tokenExpiry ? new Date(this.tokenExpiry) : null,
            remainingMinutes: remainingMinutes,
            token: this.currentToken.substring(0, 20) + '...' // Aperçu
        };
    }
}

// Instance singleton
export const meteoAuth = new MeteoFranceAuth();

export default meteoAuth;
