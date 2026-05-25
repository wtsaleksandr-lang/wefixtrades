import type { Express } from "express";
import { type Server } from "http";
import auditRouter from "../auditRoutes";

import { registerAuthRoutes } from "./authRoutes";
import { registerMarketingRoutes } from "./marketingRoutes";
import { registerMarketingWaitlistRoutes } from "./marketingWaitlistRoutes";
import { registerSitemapRoutes } from "./sitemapRoutes";
import { registerRobotsRoutes } from "./robotsRoutes";
import { registerAiRoutes } from "./aiRoutes";
import { registerCalculatorRoutes } from "./calculatorRoutes";
import { registerLeadRoutes } from "./leadRoutes";
import { registerDashboardRoutes } from "./dashboardRoutes";
import { registerDomainRoutes } from "./domainRoutes";
import { registerBookingRoutes } from "./bookingRoutes";
import { registerStripeRoutes } from "./stripeRoutes";
import { registerTwilioRoutes } from "./twilioRoutes";
import { registerChatRoutes } from "./chatRoutes";
import { registerAdminRoutes } from "./adminRoutes";
import { registerAdminCrmRoutes } from "./adminCrmRoutes";
import { registerAdminClientCostsRoutes } from "./adminClientCostsRoutes";
import { registerAdminToolRoutes } from "./adminToolRoutes";
import { registerAiChannelSettingsRoutes } from "./aiChannelSettingsRoutes";
import { registerAdminAiChannelGatesRoutes } from "./adminAiChannelGatesRoutes";
import { registerInboundEmailRoutes } from "./inboundEmailRoutes";
import { registerFounderNotifyRoutes } from "./founderNotifyRoutes";
import { registerStripeBillingRoutes } from "./stripeBillingRoutes";
import { registerCitationTrackerRoutes } from "./citationTrackerRoutes";
import { registerCitationBuilderRoutes } from "./citationBuilderRoutes";
import { registerFullAuditRoutes } from "./fullAuditRoutes";
import { registerWidgetDepositRoutes } from "./widgetDepositRoutes";
import { registerBillingPortalRoute } from "./billingPortalRoute";
import { registerEmailTrackingRoutes } from "./emailTrackingRoutes";
import { registerSendgridWebhookRoutes } from "./sendgridWebhookRoutes";
import { registerOnboardingPublicRoutes } from "./onboardingPublicRoutes";
import { registerVapiRoutes } from "./vapiRoutes";
import { registerPublicCheckoutRoutes } from "./publicCheckoutRoutes";
import { registerIntegrationHealthRoutes } from "./integrationHealthRoutes";
import { registerPortalRoutes } from "./portalRoutes";
import { registerPortalEmailDomainRoutes } from "./portalEmailDomainRoutes";
import { registerPortalSecurityRoutes } from "./portalSecurityRoutes";
import { registerAdminSupportRoutes } from "./adminSupportRoutes";
import { registerMissedCallLeadRoutes } from "./missedCallLeadRoutes";
import { registerDemoLeadRoutes } from "./demoLeadRoutes";
import { registerAdminOpsRoutes, registerBrandAvailabilityRoutes } from "./adminOpsRoutes";
import { registerAdminEnvPresenceRoutes } from "./adminEnvPresence";
import { registerAdminOutboundRoutes } from "./adminOutboundRoutes";
import { registerAdminOutreachSequencesRoutes } from "./adminOutreachSequencesRoutes";
import { registerReviewPublicRoutes } from "./reviewPublicRoutes";
import { registerWidgetRoutes } from "./widgetRoutes";
import { registerWidgetFreetoolsRoutes } from "./widgetFreetoolsRoutes";
import { registerPortalFreetoolsRoutes } from "./portalFreetoolsRoutes";
import { registerReviewFunnelRoutes } from "./reviewFunnelRoutes";
import { registerPortalReviewLinkRoutes } from "./portalReviewLinkRoutes";
import { registerServiceAreaMapRoutes } from "./serviceAreaMapRoutes";
import { registerMapguardRoutes } from "./mapguardRoutes";
import { registerSocialSyncRoutes } from "./socialSyncRoutes";
import { registerReputationRoutes } from "./reputationRoutes";
import { registerSalesRoutes } from "./salesRoutes";
import { registerMediaRoute } from "../services/socialSync/mediaService";
import { registerRankFlowRoutes } from "./rankflowRoutes";
import { registerContentFlowRoutes } from "./contentflowRoutes";
import { registerPortalContentflowQuotaRoutes } from "./portal/contentflowQuota";
import { registerUnsubscribeRoutes } from "./unsubscribeRoutes";
import { registerEmailChartsRoute } from "../services/emailCharts";
import { registerAdminSupplierRoutes } from "./adminSupplierRoutes";
import { registerSupplierWebhookRoutes } from "./supplierWebhookRoutes";
import { registerMetaMessagingWebhookRoutes } from "./metaMessagingWebhookRoutes";
import { registerMetaWhatsappWebhookRoutes } from "./metaWhatsappWebhookRoutes";
import { registerDopplerWebhookRoutes } from "./dopplerWebhookRoutes";
import { registerAdminServiceRoutes } from "./adminServiceRoutes";
import { registerApprovalRoutes } from "./approvalRoutes";
import { registerDemoRoutes } from "./demoRoutes";
import { registerBookingApiRoutes } from "./bookingApiRoutes";
import { registerBookflowRoutes } from "./bookflowRoutes";
import { registerInvoiceTemplateRoutes } from "./invoiceTemplateRoutes";
import { registerAdminAlertRoutes } from "./adminAlertRoutes";
import { registerChatAttachmentRoutes } from "./chatAttachmentRoutes";
import { registerTradelineSetupRoutes } from "./tradelineSetupRoutes";
import { registerTradelineWidgetRoutes } from "./tradelineWidgetRoutes";
import { registerAdminTradelineSetupsRoutes } from "./adminTradelineSetupsRoutes";
import { registerAdminTradelineTemplatesRoutes } from "./adminTradelineTemplatesRoutes";
import { registerTradelineChatInstallRoutes } from "./tradelineChatInstallRoutes";
import { registerAdminTradelineLearningRoutes } from "./adminTradelineLearningRoutes";
import { registerMobileAuthRoutes } from "./mobileAuthRoutes";
import { registerMobileApiRoutes } from "./mobileApiRoutes";
import { registerMobileVoiceRoutes } from "./mobileVoiceRoutes";
import { registerMobileAiRoutes } from "./mobileAiRoutes";
import { registerMobileAiImagesRoutes } from "./mobileAiImagesRoutes";
import { registerMobileAiVoiceRoutes } from "./mobileAiVoiceRoutes";
import { registerMobileContactRoutes } from "./mobileContactRoutes";
import { registerTwilioVoiceCallbackRoutes } from "./twilioVoiceCallbackRoutes";
import { registerVoicemailRoutes } from "./voicemailRoutes";
import { registerQuoteQuickAiChatRoutes } from "./quotequickAiChatRoutes";
import { registerAiImageToTemplateRoutes } from "./aiImageToTemplateRoutes";
import { registerAiDemoRoutes } from "./aiDemoRoutes";
import { registerAdminAiBudgetRoutes } from "./adminAiBudgetRoutes";
import { registerTwilioCommsRoutes } from "./twilioCommsRoutes";
import { registerAdminContactsRoutes } from "./adminContactsRoutes";
import { registerWidgetSchedulingRoutes } from "./widgetSchedulingRoutes";
import { registerQuoteSnapshotRoutes } from "./quoteSnapshotRoutes";
import { registerAdminQuoteQuickTemplatesRoutes } from "./adminQuoteQuickTemplatesRoutes";
import { registerAdminQuoteQuickTradesRoutes } from "./adminQuoteQuickTradesRoutes";
import { registerQuoteQuickPublicRoutes } from "./quotequickPublicRoutes";
import { registerAdminApiPlatformRoutes } from "./adminApiPlatformRoutes";
import { registerPortalApiKeysRoutes } from "./portalApiKeysRoutes";
import { registerPortalBrandKitsRoutes } from "./portalBrandKitsRoutes";
import { registerAdminTradelineVoicesRoutes } from "./adminTradelineVoicesRoutes";
import { registerPortalTradelineKnowledgeRoutes } from "./portalTradelineKnowledgeRoutes";
import { registerAdminAuditLogRoutes } from "./adminAuditLogRoutes";
import { registerAdminFileRetentionRoutes } from "./adminFileRetentionRoutes";
import { registerAdminImpersonateRoutes } from "./adminImpersonateRoutes";
import { registerAdminMobilePreviewRoutes } from "./adminMobilePreviewRoutes";
import { registerAdminAiActivityRoutes } from "./adminAiActivityRoutes";
import { registerAdminAiRatingsRoutes } from "./adminAiRatingsRoutes";
import { registerCalculatorAnalyticsRoutes } from "./calculatorAnalyticsRoutes";
import { registerMapSnapshotRoutes } from "./mapSnapshotRoutes";
import { registerAuditSeoChecklistRoutes } from "./auditSeoChecklistRoutes";
import { registerAuditSiteSpeedComparisonRoutes } from "./auditSiteSpeedComparisonRoutes";
import { registerAuditNapConsistencyRoutes } from "./auditNapConsistencyRoutes";
import { registerAuditMarketSizerRoutes } from "./auditMarketSizerRoutes";
import { registerAuditTrustInspectorRoutes } from "./auditTrustInspectorRoutes";
import { registerFreeToolsRoutes } from "./freeToolsRoutes";
import { registerApiV1Routes } from "./apiV1";
import { registerAdminSeoIntegrationsRoutes } from "./adminSeoIntegrationsRoutes";
import { registerRumIngestRoutes } from "./rumIngestRoutes";
import { registerHealthzRoute } from "./healthz";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use("/api/audit", auditRouter);

  // Deploy Safety Wave 2 — deep healthz endpoint. Public (no auth) so
  // external monitoring + the post-deploy verifier can hit it.
  registerHealthzRoute(app);

  registerAuthRoutes(app);
  registerMarketingRoutes(app);
  registerMarketingWaitlistRoutes(app);
  // SEO Wave A — public sitemap.xml + robots.txt.
  registerSitemapRoutes(app);
  registerRobotsRoutes(app);
  registerUnsubscribeRoutes(app);
  registerAiRoutes(app);
  registerCalculatorRoutes(app);
  registerLeadRoutes(app);
  registerDashboardRoutes(app);
  registerDomainRoutes(app);
  registerBookingRoutes(app);
  registerStripeRoutes(app);
  registerTwilioRoutes(app);
  registerChatRoutes(app);
  registerAdminRoutes(app);
  registerAdminCrmRoutes(app);
  registerAdminClientCostsRoutes(app);
  registerAdminToolRoutes(app);
  registerAiChannelSettingsRoutes(app);
  registerAdminAiChannelGatesRoutes(app);
  registerStripeBillingRoutes(app);
  registerCitationTrackerRoutes(app);
  registerCitationBuilderRoutes(app);
  registerFullAuditRoutes(app);
  registerWidgetDepositRoutes(app);
  registerBillingPortalRoute(app);
  registerEmailTrackingRoutes(app);
  registerSendgridWebhookRoutes(app);
  registerInboundEmailRoutes(app);
  registerFounderNotifyRoutes(app);
  registerOnboardingPublicRoutes(app);
  registerVapiRoutes(app);
  registerPublicCheckoutRoutes(app);
  registerIntegrationHealthRoutes(app);
  registerPortalRoutes(app);
  registerPortalEmailDomainRoutes(app);
  registerPortalSecurityRoutes(app);
  registerAdminSupportRoutes(app);
  registerMissedCallLeadRoutes(app);
  registerDemoLeadRoutes(app);
  registerAdminOpsRoutes(app);
  registerBrandAvailabilityRoutes(app);
  registerAdminEnvPresenceRoutes(app);
  registerAdminOutboundRoutes(app);
  registerAdminOutreachSequencesRoutes(app);
  registerMapguardRoutes(app);
  registerSocialSyncRoutes(app);
  registerReputationRoutes(app);
  registerSalesRoutes(app);
  registerMediaRoute(app);
  registerReviewPublicRoutes(app);
  registerWidgetRoutes(app);
  registerWidgetFreetoolsRoutes(app);
  registerPortalFreetoolsRoutes(app);
  registerReviewFunnelRoutes(app);
  registerPortalReviewLinkRoutes(app);
  registerServiceAreaMapRoutes(app);
  registerRankFlowRoutes(app);
  registerContentFlowRoutes(app);
  // Phase 4 — typed quota endpoint (disjoint from contentflow.ts which Phase 3 owns).
  registerPortalContentflowQuotaRoutes(app);
  registerEmailChartsRoute(app);
  registerAdminSupplierRoutes(app);
  registerSupplierWebhookRoutes(app);
  // Meta perm #4 of 5 — pages_messaging webhook receiver. See
  // routes/metaMessagingWebhookRoutes.ts. Public (signed by Meta with
  // X-Hub-Signature-256, verified per-request).
  registerMetaMessagingWebhookRoutes(app);
  // Meta perm #5 of 5 — whatsapp_business_messaging webhook receiver. See
  // routes/metaWhatsappWebhookRoutes.ts. Public (signed by Meta with
  // X-Hub-Signature-256, verified per-request). Coexists with the
  // existing Twilio WhatsApp path on /api/twilio/*.
  registerMetaWhatsappWebhookRoutes(app);
  // Ops — Doppler webhook auto-redeploys Replit on `wefixtrades/prd`
  // secret changes. See routes/dopplerWebhookRoutes.ts. Public (signed
  // by Doppler with HMAC-SHA256, verified per-request).
  registerDopplerWebhookRoutes(app);
  registerAdminServiceRoutes(app);
  registerApprovalRoutes(app);
  registerDemoRoutes(app);
  registerBookingApiRoutes(app);
  registerBookflowRoutes(app);
  registerInvoiceTemplateRoutes(app);
  registerAdminAlertRoutes(app);
  registerChatAttachmentRoutes(app);
  registerTradelineSetupRoutes(app);
  registerTradelineWidgetRoutes(app);
  registerAdminTradelineSetupsRoutes(app);
  registerAdminTradelineTemplatesRoutes(app);
  registerTradelineChatInstallRoutes(app);
  registerAdminTradelineLearningRoutes(app);
  registerMobileAuthRoutes(app);
  registerMobileApiRoutes(app);
  registerMobileVoiceRoutes(app);
  registerMobileAiRoutes(app);
  registerMobileAiImagesRoutes(app);
  registerMobileAiVoiceRoutes(app);
  registerMobileContactRoutes(app);
  registerTwilioVoiceCallbackRoutes(app);
  registerVoicemailRoutes(app);
  registerQuoteQuickAiChatRoutes(app);
  registerAiImageToTemplateRoutes(app);
  registerAiDemoRoutes(app);
  registerAdminAiBudgetRoutes(app);
  registerTwilioCommsRoutes(app);
  registerAdminContactsRoutes(app);
  registerWidgetSchedulingRoutes(app);
  registerQuoteSnapshotRoutes(app);
  registerAdminQuoteQuickTemplatesRoutes(app);
  registerAdminQuoteQuickTradesRoutes(app);
  registerQuoteQuickPublicRoutes(app);
  registerAdminApiPlatformRoutes(app);
  registerPortalApiKeysRoutes(app);
  registerPortalBrandKitsRoutes(app);
  registerAdminTradelineVoicesRoutes(app);
  registerPortalTradelineKnowledgeRoutes(app);
  registerAdminAuditLogRoutes(app);
  registerAdminFileRetentionRoutes(app);
  registerAdminImpersonateRoutes(app);
  registerAdminMobilePreviewRoutes(app);
  registerAdminAiActivityRoutes(app);
  registerAdminAiRatingsRoutes(app);
  registerCalculatorAnalyticsRoutes(app);
  registerMapSnapshotRoutes(app);
  // Free Audit — five new tab tools (#617 follow-on). Each is its own
  // GET /api/audit/<tool>?reportId=<id> endpoint, rate-limited at 5/min/IP.
  registerAuditSeoChecklistRoutes(app);
  registerAuditSiteSpeedComparisonRoutes(app);
  registerAuditNapConsistencyRoutes(app);
  registerAuditMarketSizerRoutes(app);
  registerAuditTrustInspectorRoutes(app);
  // Free Tools — Wave 1 (Brightlocal-style public lead magnets).
  // Each tool stands alone (no reportId, no auth) so it can be linked +
  // crawled independently. Rate-limited 20/hour/IP per tool.
  registerFreeToolsRoutes(app);
  registerApiV1Routes(app);
  registerAdminSeoIntegrationsRoutes(app);
  // SEO Wave D — public RUM ingest (Core Web Vitals from real users).
  registerRumIngestRoutes(app);

  return httpServer;
}
