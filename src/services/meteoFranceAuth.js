/**
 * Service d'authentification OAuth pour Météo France
 * Gère le renouvellement automatique du token toutes les heures
 */

const OAUTH_URL = '/mf-token';
const TOKEN_DURATION = 3600; // 1 heure en secondes

class MeteoFranceAuth {
    constructor() {
        this.currentToken = null;
        this.tokenExpiry = null;
        this.refreshTimer = null;
        this.consumerKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_METEO_CONSUMER_KEY) || 'Mhar9YSs8LEluq4neXqP0YeHaaka';
        this.consumerSecret = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_METEO_CONSUMER_SECRET) || 'nDKPWzVr2_2o5Ej1aPZa7O6hu4Ia';
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
        if (!this.consumerKey || !this.consumerSecret) {
            throw new Error('Credentials non configurés. Utilisez initialize() d\'abord.');
        }

        try {
            // Encoder les credentials en Base64
            const credentials = btoa(`${this.consumerKey}:${this.consumerSecret}`);

            const response = await fetch(OAUTH_URL, {
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

            // Programmer le renouvellement automatique (5 min avant expiration)
            this.scheduleRefresh(data.expires_in - 300); // 5 min avant

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
