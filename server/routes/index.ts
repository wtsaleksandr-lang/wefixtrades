import type { Express } from "express";
import { type Server } from "http";
import auditRouter from "../auditRoutes";

import { registerAuthRoutes } from "./authRoutes";
import { registerMarketingRoutes } from "./marketingRoutes";
import { registerMarketingWaitlistRoutes } from "./marketingWaitlistRoutes";
import { registerMarketingChatRoutes } from "./marketingChatRoutes";
import { registerSitemapRoutes } from "./sitemapRoutes";
import { registerRobotsRoutes } from "./robotsRoutes";
import { registerSeoBlogRoutes } from "./seoBlogRoutes";
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
import { registerDeploymentHealthRoutes } from "./deploymentHealthRoutes";
import { registerPortalRoutes } from "./portalRoutes";
import { registerPortalEmailDomainRoutes } from "./portalEmailDomainRoutes";
import { registerPortalSecurityRoutes } from "./portalSecurityRoutes";
import { registerAdminSupportRoutes } from "./adminSupportRoutes";
import { registerMissedCallLeadRoutes } from "./missedCallLeadRoutes";
import { registerDemoLeadRoutes } from "./demoLeadRoutes";
import { registerAdminOpsRoutes, registerBrandAvailabilityRoutes } from "./adminOpsRoutes";
import { registerAdminEnvPresenceRoutes } from "./adminEnvPresence";
import { registerAdminSerpProvidersRoute } from "./adminSerpProvidersRoute";
import { registerAdminOutboundRoutes } from "./adminOutboundRoutes";
import { registerOutreachSendingRoutes } from "./outreachSendingRoutes";
import { registerOutreachAttributionRoutes } from "./outreachAttributionRoutes";
import { registerAdminOutreachSequencesRoutes } from "./adminOutreachSequencesRoutes";
import { registerReviewPublicRoutes } from "./reviewPublicRoutes";
import { registerWidgetRoutes } from "./widgetRoutes";
import { registerWidgetFreetoolsRoutes } from "./widgetFreetoolsRoutes";
import { registerPortalFreetoolsRoutes } from "./portalFreetoolsRoutes";
import { registerPortalReviewReplyRoutes } from "./portalReviewReplyRoutes";
import { registerPortalQuoteWriterRoutes } from "./portalQuoteWriterRoutes";
import { registerReviewFunnelRoutes } from "./reviewFunnelRoutes";
import { registerPartnersRoutes } from "./partnersRoutes";
import { registerAdminAffiliatesRoutes } from "./adminAffiliatesRoutes";
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
// Phase 2 video pipeline (WP6) — portal create/poll/cancel/retry + admin queue.
import { registerPortalContentflowVideoRoutes } from "./portal/contentflowVideo";
import { registerAdminContentflowVideoRoutes } from "./adminContentflowVideoRoutes";
// Wave 82 — central SMS template registry portal endpoints (GET / PATCH / test).
import { registerPortalSmsTemplatesRoutes } from "./portal/smsTemplates";
import { registerUnsubscribeRoutes } from "./unsubscribeRoutes";
import { registerEmailChartsRoute } from "../services/emailCharts";
import { registerAdminSupplierRoutes } from "./adminSupplierRoutes";
import { registerSupplierWebhookRoutes } from "./supplierWebhookRoutes";
import { registerMetaMessagingWebhookRoutes } from "./metaMessagingWebhookRoutes";
import { registerMetaWhatsappWebhookRoutes } from "./metaWhatsappWebhookRoutes";
import { registerMetaDataDeletionRoutes } from "./metaDataDeletionRoutes";
import { registerDopplerWebhookRoutes } from "./dopplerWebhookRoutes";
import { registerAdminServiceRoutes } from "./adminServiceRoutes";
import { registerApprovalRoutes } from "./approvalRoutes";
import { registerDemoRoutes } from "./demoRoutes";
import { registerBookingApiRoutes } from "./bookingApiRoutes";
import { registerBookflowRoutes } from "./bookflowRoutes";
import { registerInvoiceTemplateRoutes } from "./invoiceTemplateRoutes";
import { registerAdminAlertRoutes } from "./adminAlertRoutes";
import { registerAiActionsRoutes } from "./aiActionsRoutes";
import { registerAdminContentPipelineRoutes } from "./adminContentPipelineRoutes";
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
import { registerTwilioStatusCallbackRoutes } from "./twilioStatusCallbackRoutes";
import { registerVoicemailRoutes } from "./voicemailRoutes";
import { registerQuoteQuickAiChatRoutes } from "./quotequickAiChatRoutes";
import { registerAiImageToTemplateRoutes } from "./aiImageToTemplateRoutes";
import { registerAiDemoRoutes } from "./aiDemoRoutes";
import { registerAdminAiBudgetRoutes } from "./adminAiBudgetRoutes";
import { registerTwilioCommsRoutes } from "./twilioCommsRoutes";
import { registerAdminContactsRoutes } from "./adminContactsRoutes";
import { registerWidgetSchedulingRoutes } from "./widgetSchedulingRoutes";
import { registerQuoteWidgetDistanceRoutes } from "./quoteWidgetDistanceRoutes";
import { registerQuoteWidgetUploadRoutes } from "./quoteWidgetUploadRoutes";
import { registerQuoteSnapshotRoutes } from "./quoteSnapshotRoutes";
import { registerAdminQuoteQuickTemplatesRoutes } from "./adminQuoteQuickTemplatesRoutes";
import { registerAdminQuoteQuickTradesRoutes } from "./adminQuoteQuickTradesRoutes";
import { registerQuoteQuickPublicRoutes } from "./quotequickPublicRoutes";
import { registerRoofQuoteRoutes } from "./roofQuoteRoutes";
import { registerAdminApiPlatformRoutes } from "./adminApiPlatformRoutes";
import { registerPortalApiKeysRoutes } from "./portalApiKeysRoutes";
import { registerPortalBrandKitsRoutes } from "./portalBrandKitsRoutes";
import { registerAdminTradelineVoicesRoutes } from "./adminTradelineVoicesRoutes";
import { registerPortalTradelineKnowledgeRoutes } from "./portalTradelineKnowledgeRoutes";
import { registerPortalAiAssistantRoutes } from "./portalAiAssistantRoutes";
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
import { registerAdminSeoReviewRoutes } from "./adminSeoReviewRoutes";
import { registerAdminSeoMatrixRoutes } from "./adminSeoMatrixRoutes";
import { registerRumIngestRoutes } from "./rumIngestRoutes";
import { registerHealthzRoute } from "./healthz";
import { registerAiInsightsRoutes } from "./aiInsightsRoutes";
import { registerAdminHealthRoutes } from "./adminHealthRoutes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use("/api/audit", auditRouter);

  // Deploy Safety Wave 2 — deep healthz endpoint. Public (no auth) so
  // external monitoring + the post-deploy verifier can hit it.
  registerHealthzRoute(app);

  registerAuthRoutes(app);
  // Affiliate + Referral (Phase 1): ?ref= capture middleware, /ref/:code short
  // link, and GET /api/client/referral. Registered early — before the SPA
  // catch-all — so /ref/:code resolves server-side.
  registerPartnersRoutes(app);
  registerMarketingRoutes(app);
  registerMarketingWaitlistRoutes(app);
  registerMarketingChatRoutes(app);
  // SEO Wave A — public sitemap.xml + robots.txt.
  registerSitemapRoutes(app);
  registerRobotsRoutes(app);
  // Owned-domain SEO content engine — public published-article read API.
  registerSeoBlogRoutes(app);
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
  registerAdminAffiliatesRoutes(app);
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
  registerDeploymentHealthRoutes(app);
  // Wave 140 — per-product / per-tool health-signal aggregator.
  // GET /api/admin/health (requireAdmin). Monitoring-only: no UI, no
  // auto-resolution, no SMS, no systemAlerts writes, no cron yet.
  registerAdminHealthRoutes(app);
  // ROUTE-ORDER (W-AW-1): the literal /api/portal/tradeline/{knowledge,voices,
  // settings} routes MUST be registered BEFORE registerPortalRoutes, whose
  // param route GET /api/portal/tradeline/:clientServiceId would otherwise
  // shadow them (Express 5 matches in registration order, first-match-wins, and
  // no longer supports inline regex params like :id(\\d+) for digit-constraint).
  // Without this, GET /knowledge etc. hit the param handler → parseInt("knowledge")
  // → NaN → 400 "Invalid service id", breaking the portal "Teach your assistant"
  // panel and causing duplicate knowledge `doc` rows on every save.
  registerPortalTradelineKnowledgeRoutes(app);
  registerPortalRoutes(app);
  registerPortalEmailDomainRoutes(app);
  registerPortalSecurityRoutes(app);
  registerAdminSupportRoutes(app);
  registerMissedCallLeadRoutes(app);
  registerDemoLeadRoutes(app);
  registerAdminOpsRoutes(app);
  registerBrandAvailabilityRoutes(app);
  registerAdminEnvPresenceRoutes(app);
  registerAdminSerpProvidersRoute(app);
  registerAdminOutboundRoutes(app);
  registerOutreachSendingRoutes(app);
  registerOutreachAttributionRoutes(app);
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
  // AI Review Responder — interactive free tool. Reuses the QuoteQuick AI
  // budget cap (getUserBudgetSnapshot/gateDecision/recordSpend) + shared
  // Anthropic client. Client route: /portal/free-tools/review-responder.
  registerPortalReviewReplyRoutes(app);
  // AI Quote Writer — interactive free tool. Reuses the QuoteQuick AI budget
  // cap (getUserBudgetSnapshot/gateDecision/recordSpend) + shared Anthropic
  // client. Client route: /portal/free-tools/quote-writer.
  registerPortalQuoteWriterRoutes(app);
  registerReviewFunnelRoutes(app);
  registerPortalReviewLinkRoutes(app);
  registerServiceAreaMapRoutes(app);
  registerRankFlowRoutes(app);
  registerContentFlowRoutes(app);
  // Phase 4 — typed quota endpoint (disjoint from contentflow.ts which Phase 3 owns).
  registerPortalContentflowQuotaRoutes(app);
  // Phase 2 video pipeline (WP6) — disjoint sibling files, same pattern.
  registerPortalContentflowVideoRoutes(app);
  registerAdminContentflowVideoRoutes(app);
  // Wave 82 — central SMS template registry endpoints (Wave 83 UI consumer).
  registerPortalSmsTemplatesRoutes(app);
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
  // Meta App Review requirement — signed_request data-deletion callback
  // (POST /api/meta/data-deletion) + human-readable status page. Public
  // (signed by Meta with HMAC-SHA256 signed_request, verified per-request).
  registerMetaDataDeletionRoutes(app);
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
  // Wave 34 — universal AI-action dispatcher + cross-product audit log.
  registerAiActionsRoutes(app);
  registerAdminContentPipelineRoutes(app);
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
  registerTwilioStatusCallbackRoutes(app);
  registerVoicemailRoutes(app);
  registerQuoteQuickAiChatRoutes(app);
  registerAiImageToTemplateRoutes(app);
  registerAiDemoRoutes(app);
  registerAdminAiBudgetRoutes(app);
  registerTwilioCommsRoutes(app);
  registerAdminContactsRoutes(app);
  registerWidgetSchedulingRoutes(app);
  registerQuoteWidgetDistanceRoutes(app); // PRICING-MODELS U1 — public address_distance resolver
  registerQuoteWidgetUploadRoutes(app); // PRICING-MODELS U4 — public photo_upload endpoint
  registerQuoteSnapshotRoutes(app);
  registerAdminQuoteQuickTemplatesRoutes(app);
  registerAdminQuoteQuickTradesRoutes(app);
  registerQuoteQuickPublicRoutes(app);
  registerRoofQuoteRoutes(app);
  registerAdminApiPlatformRoutes(app);
  registerPortalApiKeysRoutes(app);
  registerPortalBrandKitsRoutes(app);
  registerAdminTradelineVoicesRoutes(app);
  // registerPortalTradelineKnowledgeRoutes moved earlier (before registerPortalRoutes)
  // to avoid the param-route shadow — see ROUTE-ORDER note above.
  registerPortalAiAssistantRoutes(app);
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
  // Wave 7 — AI Insights bundled with MapGuard ($99/$149/mo). Generates
  // Claude-powered prioritized actions from MapGuard / CT signals.
  registerAiInsightsRoutes(app);
  registerAdminSeoIntegrationsRoutes(app);
  // Owned-domain SEO content engine — admin human-review queue (list /
  // preview / edit / approve→publish / reject→archive). Drafts arrive from
  // seoArticleGenerator as status='in_review'; nothing auto-publishes.
  registerAdminSeoReviewRoutes(app);
  // Owned-domain SEO programmatic [trade]×[city]×[job] matrix — admin-triggered
  // hard-limited batch (NEVER a cron). Produces in_review drafts gated by
  // k-anonymity + dedup + unique-data-score; nothing auto-publishes.
  registerAdminSeoMatrixRoutes(app);
  // SEO Wave D — public RUM ingest (Core Web Vitals from real users).
  registerRumIngestRoutes(app);

  return httpServer;
}
