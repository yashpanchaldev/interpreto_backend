import Stripe from 'stripe';
import { CONFIG } from './flavour.js';
export const stripe = new Stripe(CONFIG.STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15',
});
