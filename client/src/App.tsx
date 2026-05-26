import { Switch, Route, Redirect } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CopilotFormProvider } from "@/context/CopilotFormContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ImpersonateBanner } from "@/components/admin/ImpersonateBanner";
import AppErrorBoundary from "@/components/shared/AppErrorBoundary";
import NotFound from "@/pages/not-found";
import { hostedSlugFromHost } from "@shared/slugUtils";

/**
 * Wave 9 — route-based code-splitting.
 *
 * Strategy:
 *   - Keep STATIC (in marketing critical path so LCP not blocked by chunk fetch):
 *       MarketingHome, MarketingPricing, PricingUnified, ProductIndex,
 *       MarketingProduct, MarketingServices, MarketingTemplates,
 *       EffortelProductPage, NotFound.
 *   - LAZY-LOAD everything else: admin/*, portal/*, tools/*, audit, wizard,
 *     compare/*, demos/*, docs sub-pages, dev/*, free-tools/*, etc.
 *
 * The Suspense boundary wraps the entire <Switch> so any lazy chunk shows
 * the spinner during fetch. Pre-Wave-9, only Wizard / Calculator / FreeAudit
 * / TradePromptsPage / ContentFlowStandalone were lazy.
 *
 * Prerender (77 routes) keeps working: per-route hydration uses headless
 * Chromium and waits for PageMeta, so the lazy chunk loads before snapshot.
 */

// ── Critical-path (static) marketing routes ────────────────────────────────
import MarketingHome from "@/pages/marketing/home";
import MarketingProduct from "@/pages/marketing/product";
import MarketingPricing from "@/pages/marketing/pricing";
import QuoteQuickPricing from "@/pages/marketing/quotequick-pricing";
import ProductIndex from "@/pages/product/ProductIndex";
import MarketingServices from "@/pages/marketing/services";
import MarketingTemplates from "@/pages/marketing/templates";
import EffortelProductPage from "@/pages/products/EffortelProductPage";
import PricingUnified from "@/pages/PricingUnified";
import LoginPage from "@/pages/login";

// ── Auth wrappers (small, used widely; keep static) ────────────────────────
import RequirePortal from "@/components/auth/RequirePortal";
import RequireClient from "@/components/auth/RequireClient";

// ── Wizard/calculator/audit family (already lazy pre-Wave-9) ───────────────
const Wizard = lazy(() => import("@/pages/wizard"));
const WizardLegacy = lazy(() => import("@/pages/wizard-legacy"));
const Calculator = lazy(() => import("@/pages/calculator"));
const FreeAudit = lazy(() => import("@/pages/marketing/FreeAudit"));
const TradePromptsPage = lazy(() => import("@/pages/marketing/TradePromptsPage"));
const ContentFlowStandalone = lazy(() => import("@/pages/marketing/ContentFlowStandalone"));

// ── Newly lazy in Wave 9: editor / legacy app pages ────────────────────────
const EditCalculator = lazy(() => import("@/pages/edit-calculator"));
const LeadsPage = lazy(() => import("@/pages/leads"));
const Dashboard = lazy(() => import("@/pages/dashboard"));

// ── Marketing — secondary pages ────────────────────────────────────────────
const MarketingTemplateDetail = lazy(() => import("@/pages/marketing/template-detail"));
const MarketingDemo = lazy(() => import("@/pages/marketing/demo"));
const MarketingDocs = lazy(() => import("@/pages/marketing/docs"));
const MarketingContact = lazy(() => import("@/pages/marketing/contact"));
const MarketingPrivacy = lazy(() => import("@/pages/marketing/privacy"));
const MarketingTerms = lazy(() => import("@/pages/marketing/terms"));
const FeatureInstantQuotes = lazy(() => import("@/pages/marketing/features/instant-quotes"));
const FeatureBooking = lazy(() => import("@/pages/marketing/features/booking"));
const FeatureAiEmployee = lazy(() => import("@/pages/marketing/features/ai-employee"));
const FeatureSms = lazy(() => import("@/pages/marketing/features/sms"));
const FeatureCalculatorEngine = lazy(() => import("@/pages/marketing/features/calculator-engine"));
const DemoTemplate = lazy(() => import("@/pages/marketing/demo-template"));
const DocsEmbed = lazy(() => import("@/pages/marketing/docs/embed"));
const DocsDomain = lazy(() => import("@/pages/marketing/docs/domain"));
const DocsBooking = lazy(() => import("@/pages/marketing/docs/booking"));
const DocsAi = lazy(() => import("@/pages/marketing/docs/ai"));
const DocsMapguard = lazy(() => import("@/pages/marketing/docs/mapguard"));
const DocsReputationShield = lazy(() => import("@/pages/marketing/docs/reputationshield"));
const DocsWebhooks = lazy(() => import("@/pages/marketing/docs/webhooks"));
const DocsTroubleshooting = lazy(() => import("@/pages/marketing/docs/troubleshooting"));
const ApiDocsPage = lazy(() => import("@/pages/marketing/ApiDocsPage"));
const SolutionsVisibility = lazy(() => import("@/pages/marketing/solutions-visibility"));
const ForAgenciesPage = lazy(() => import("@/pages/marketing/ForAgenciesPage"));
const ForFranchisesPage = lazy(() => import("@/pages/marketing/ForFranchisesPage"));
const ForSoloTradersPage = lazy(() => import("@/pages/marketing/ForSoloTradersPage"));
const SitemapPage = lazy(() => import("@/pages/marketing/SitemapPage"));
// Wave 11D D5 — new hub pages.
const MapGuardSuitePage = lazy(() => import("@/pages/marketing/MapGuardSuitePage"));
const FreeToolsHubPage = lazy(() => import("@/pages/marketing/FreeToolsHubPage"));

// ── Free Tools — public marketing tools ────────────────────────────────────
const GoogleReviewLinkGenerator = lazy(() => import("@/pages/marketing/tools/GoogleReviewLinkGenerator"));
const LocalSerpChecker = lazy(() => import("@/pages/marketing/tools/LocalSerpChecker"));
const LocalRankTracker = lazy(() => import("@/pages/marketing/tools/LocalRankTracker"));
const CitationChecker = lazy(() => import("@/pages/marketing/tools/CitationChecker"));
const LocalRankflux = lazy(() => import("@/pages/marketing/tools/LocalRankflux"));
const LocalRankGrid = lazy(() => import("@/pages/marketing/tools/LocalRankGrid"));
const CitationBuilderPage = lazy(() => import("@/pages/marketing/CitationBuilderPage"));

// ── Compare / SEO landing pages ────────────────────────────────────────────
const CompareVsJobber = lazy(() => import("@/pages/marketing/compare/CompareVsJobber"));
const CompareVsHousecallPro = lazy(() => import("@/pages/marketing/compare/CompareVsHousecallPro"));
const CompareVsServiceTitan = lazy(() => import("@/pages/marketing/compare/CompareVsServiceTitan"));
const CompareNiceJob = lazy(() => import("@/pages/marketing/CompareNiceJob"));
const ComparisonPage = lazy(() => import("@/pages/marketing/ComparisonPage"));

// ── QuoteQuick product surfaces ────────────────────────────────────────────
const QuoteCalculatorDemo = lazy(() => import("@/pages/products/quotequick/demo"));
const BuildWithAi = lazy(() => import("@/pages/products/quotequick/BuildWithAi"));
const BuildWithAiPreview = lazy(() => import("@/pages/products/quotequick/BuildWithAiPreview"));

// ── Shared / public ───────────────────────────────────────────────────────
const SharedAuditReport = lazy(() => import("@/pages/marketing/SharedAuditReport"));
const CitationTrackerPage = lazy(() => import("@/pages/marketing/CitationTrackerPage"));
const SolutionPage = lazy(() => import("@/pages/solutions/SolutionPage"));
const DemoCenter = lazy(() => import("@/pages/demos/DemoCenter"));
const DemoPage = lazy(() => import("@/pages/demos/DemoPage"));
const SocialSyncDemo = lazy(() => import("@/pages/demos/SocialSyncDemo"));
const RankFlowDemo = lazy(() => import("@/pages/demos/RankFlowDemo"));
const ReputationShieldDemo = lazy(() => import("@/pages/demos/ReputationShieldDemo"));
const Plans = lazy(() => import("@/pages/Plans"));
const CheckoutSuccess = lazy(() => import("@/pages/CheckoutSuccess"));
const CheckoutCancelled = lazy(() => import("@/pages/CheckoutCancelled"));
const Resources = lazy(() => import("@/pages/Resources"));
const DesignShowcase = lazy(() => import("@/pages/marketing/DesignShowcase"));
const About = lazy(() => import("@/pages/About"));
const Blog = lazy(() => import("@/pages/Blog"));
const CaseStudies = lazy(() => import("@/pages/CaseStudies"));
const PrimitivesPage = lazy(() => import("@/pages/dev/primitives"));
const DemoCanvas = lazy(() => import("@/pages/dev/DemoCanvas"));

// ── Admin (heavy, rarely-loaded by public) ─────────────────────────────────
const AiDashboard = lazy(() => import("@/pages/admin/AiDashboard"));
const CrmOverview = lazy(() => import("@/pages/admin/CrmOverview"));
const ClientsPage = lazy(() => import("@/pages/admin/ClientsPage"));
const ClientDetailPage = lazy(() => import("@/pages/admin/ClientDetailPage"));
const SuppliersPage = lazy(() => import("@/pages/admin/SuppliersPage"));
const InboxPage = lazy(() => import("@/pages/admin/InboxPage"));
const CommunicationsPage = lazy(() => import("@/pages/admin/CommunicationsPage"));
const SystemAlertsPage = lazy(() => import("@/pages/admin/SystemAlertsPage"));
const ContentPipelinePage = lazy(() => import("@/pages/admin/ContentPipelinePage"));
const AdminAuditLogPage = lazy(() => import("@/pages/admin/AdminAuditLogPage"));
const WaitlistPage = lazy(() => import("@/pages/admin/WaitlistPage"));
const AuditLogPage = lazy(() => import("@/pages/admin/AuditLogPage"));
const AuditLeadsPage = lazy(() => import("@/pages/admin/AuditLeadsPage"));
const AdminChatHistoryPage = lazy(() => import("@/pages/admin/AdminChatHistoryPage"));
const IntegrationHealthPage = lazy(() => import("@/pages/admin/IntegrationHealthPage"));
const SeoIntegrationsPage = lazy(() => import("@/pages/admin/SeoIntegrationsPage"));
const BillingPage = lazy(() => import("@/pages/admin/BillingPage"));
const ServicesPage = lazy(() => import("@/pages/admin/ServicesPage"));
const ProductDetailPage = lazy(() => import("@/pages/admin/ProductDetailPage"));
const ServiceOpsPage = lazy(() => import("@/pages/admin/ServiceOpsPage"));
const MapguardDashboard = lazy(() => import("@/pages/admin/MapguardDashboard"));
const MapguardOpsPage = lazy(() => import("@/pages/admin/MapguardOpsPage"));
const WebCareOpsPage = lazy(() => import("@/pages/admin/WebCareOpsPage"));
const AiBudgetPage = lazy(() => import("@/pages/admin/AiBudgetPage"));
const AdminAiGatesPage = lazy(() => import("@/pages/admin/AdminAiGatesPage"));
const AdminAiChannelsPage = lazy(() => import("@/pages/admin/AdminAiChannelsPage"));
const AdminAiActivityPage = lazy(() => import("@/pages/admin/AdminAiActivityPage"));
const UiPrimitivesDemo = lazy(() => import("@/pages/admin/UiPrimitivesDemo"));
const ReviewsPage = lazy(() => import("@/pages/admin/ReviewsPage"));
const RankFlowOpsPage = lazy(() => import("@/pages/admin/RankFlowOpsPage"));
const AdFlowOpsPage = lazy(() => import("@/pages/admin/AdFlowOpsPage"));
const ProfilePage = lazy(() => import("@/pages/admin/ProfilePage"));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage"));
const ChangePasswordPage = lazy(() => import("@/pages/admin/ChangePasswordPage"));
const ProspectsPage = lazy(() => import("@/pages/admin/outbound/ProspectsPage"));
const CampaignsPage = lazy(() => import("@/pages/admin/outbound/CampaignsPage"));
const PipelinePage = lazy(() => import("@/pages/admin/outbound/PipelinePage"));
const SequencesPage = lazy(() => import("@/pages/admin/outbound/SequencesPage"));
const SocialSyncOpsPage = lazy(() => import("@/pages/admin/SocialSyncOpsPage"));
const ContentFlowQueuePage = lazy(() => import("@/pages/admin/ContentFlowQueuePage"));
const SalesPipelinePage = lazy(() => import("@/pages/admin/SalesPipelinePage"));
const BookingCalendarPage = lazy(() => import("@/pages/admin/BookingCalendarPage"));
const SystemJobsPage = lazy(() => import("@/pages/admin/SystemJobsPage"));
const SystemWorkersPage = lazy(() => import("@/pages/admin/SystemWorkersPage"));
const SystemAvailabilityPage = lazy(() => import("@/pages/admin/SystemAvailabilityPage"));
const TradeLineOpsPage = lazy(() => import("@/pages/admin/TradeLineOpsPage"));
const TradelineSetupsPage = lazy(() => import("@/pages/admin/TradelineSetupsPage"));
const TradelineTemplatesPage = lazy(() => import("@/pages/admin/TradelineTemplatesPage"));
const TradelineLearningPage = lazy(() => import("@/pages/admin/TradelineLearningPage"));
const TradelineVoicesPage = lazy(() => import("@/pages/admin/TradelineVoicesPage"));
const MobilePreviewPage = lazy(() => import("@/pages/admin/MobilePreview"));
const QuoteQuickPage = lazy(() => import("@/pages/admin/QuoteQuickPage"));
const QuoteQuickTradesPage = lazy(() => import("@/pages/admin/QuoteQuickTradesPage"));
const QuoteQuickTradeDetailPage = lazy(() => import("@/pages/admin/QuoteQuickTradeDetailPage"));
const QuoteQuickTemplatesPage = lazy(() => import("@/pages/admin/QuoteQuickTemplatesPage"));
const QuoteQuickTemplateDetailPage = lazy(() => import("@/pages/admin/QuoteQuickTemplateDetailPage"));
const ApiPlatformPage = lazy(() => import("@/pages/admin/ApiPlatformPage"));
const ApiPlatformUserDetailPage = lazy(() => import("@/pages/admin/ApiPlatformUserDetailPage"));
const SupportInboxPage = lazy(() => import("@/pages/admin/SupportInboxPage"));
const SupportTicketDetailPage = lazy(() => import("@/pages/admin/SupportTicketDetailPage"));
const AdminNoticesPage = lazy(() => import("@/pages/admin/AdminNoticesPage"));
const InstallQueuePage = lazy(() => import("@/pages/admin/InstallQueuePage"));

// ── Portal (auth-gated client area) ────────────────────────────────────────
const PortalDashboard = lazy(() => import("@/pages/portal/PortalDashboard"));
const PortalCalculatorAnalytics = lazy(() => import("@/pages/portal/PortalCalculatorAnalytics"));
const PortalServices = lazy(() => import("@/pages/portal/PortalServices"));
const PortalReviews = lazy(() => import("@/pages/portal/PortalReviews"));
const PortalCompetitors = lazy(() => import("@/pages/portal/PortalCompetitors"));
const PortalWidget = lazy(() => import("@/pages/portal/PortalWidget"));
const PortalReviewsSetup = lazy(() => import("@/pages/portal/PortalReviewsSetup"));
const PortalServiceDetail = lazy(() => import("@/pages/portal/PortalServiceDetail"));
const PortalBilling = lazy(() => import("@/pages/portal/PortalBilling"));
const PortalSettings = lazy(() => import("@/pages/portal/PortalSettings"));
const PortalOnboarding = lazy(() => import("@/pages/portal/PortalOnboarding"));
const TradelineSetupPage = lazy(() => import("@/pages/portal/TradelineSetup"));
const TradeLineDashboard = lazy(() => import("@/pages/portal/tradeline/TradeLineDashboard"));
const PortalTradelineKnowledgePage = lazy(() => import("@/pages/portal/PortalTradelineKnowledgePage"));
const PortalTradelineVoicePage = lazy(() => import("@/pages/portal/PortalTradelineVoicePage"));
const PortalEmailDomainSetup = lazy(() => import("@/pages/portal/PortalEmailDomainSetup"));
const ChatWidgetInstallEntry = lazy(() => import("@/pages/portal/ChatWidgetInstallEntry"));
const ChatWidgetInstallOnboarding = lazy(() => import("@/pages/portal/ChatWidgetInstallOnboarding"));
const PortalChatWidgetSetup = lazy(() => import("@/pages/portal/PortalChatWidgetSetup"));
const PortalHelp = lazy(() => import("@/pages/portal/PortalHelp"));
const PortalTicketDetail = lazy(() => import("@/pages/portal/PortalTicketDetail"));
const PortalMapguard = lazy(() => import("@/pages/portal/PortalMapguard"));
const MapGuardDashboard = lazy(() => import("@/pages/portal/mapguard/MapGuardDashboard"));
const MapGuardAlertSettings = lazy(() => import("@/pages/portal/mapguard/AlertSettings"));
const ReputationShieldDashboard = lazy(() => import("@/pages/portal/reputationshield/ReputationShieldDashboard"));
const ReputationShieldNotificationSettings = lazy(() => import("@/pages/portal/reputationshield/NotificationSettings"));
const ReputationShieldSetup = lazy(() => import("@/pages/portal/reputationshield/ReputationShieldSetup"));
const AiInsightsPage = lazy(() => import("@/pages/portal/AiInsightsPage"));
const CitationTrackerDashboard = lazy(() => import("@/pages/portal/CitationTrackerDashboard"));
const CitationBuilderDashboard = lazy(() => import("@/pages/portal/CitationBuilderDashboard"));
const SocialSyncSetup = lazy(() => import("@/pages/portal/SocialSyncSetup"));
const PortalSocialSync = lazy(() => import("@/pages/portal/PortalSocialSync"));
const SocialSyncDashboard = lazy(() => import("@/pages/portal/socialsync/SocialSyncDashboard"));
const PortalRankFlow = lazy(() => import("@/pages/portal/PortalRankFlow"));
const RankFlowDashboard = lazy(() => import("@/pages/portal/rankflow/RankFlowDashboard"));
const PortalArticles = lazy(() => import("@/pages/portal/PortalArticles"));
const PortalContentPreferences = lazy(() => import("@/pages/portal/PortalContentPreferences"));
const PortalContentFlow = lazy(() => import("@/pages/portal/PortalContentFlow"));
const ContentExamplesPage = lazy(() => import("@/pages/portal/contentflow/ContentExamplesPage"));
const PortalContentFlowDashboard = lazy(() => import("@/pages/portal/contentflow/PortalContentFlowDashboard"));
const PortalChatHistoryPage = lazy(() => import("@/pages/portal/PortalChatHistoryPage"));
const DispatchPage = lazy(() => import("@/pages/portal/DispatchPage"));
const InvoicesPage = lazy(() => import("@/pages/portal/InvoicesPage"));
const InvoiceDetailPage = lazy(() => import("@/pages/portal/InvoiceDetailPage"));
const PaymentMethodsPage = lazy(() => import("@/pages/portal/PaymentMethodsPage"));
const BookFlowSetupPage = lazy(() => import("@/pages/portal/BookFlowSetupPage"));
const PortalCatalog = lazy(() => import("@/pages/portal/PortalCatalog"));
const PortalApiAccessPage = lazy(() => import("@/pages/portal/PortalApiAccessPage"));
const PortalBrandKitsPage = lazy(() => import("@/pages/portal/PortalBrandKitsPage"));
const FreeToolsIndex = lazy(() => import("@/pages/portal/FreeTools"));
const SchemaGenerator = lazy(() => import("@/pages/portal/FreeTools/SchemaGenerator"));
const FaqWidget = lazy(() => import("@/pages/portal/FreeTools/FaqWidget"));
const HoursWidget = lazy(() => import("@/pages/portal/FreeTools/HoursWidget"));
const TrustBadges = lazy(() => import("@/pages/portal/FreeTools/TrustBadges"));
const ReviewLink = lazy(() => import("@/pages/portal/FreeTools/ReviewLink"));
const CallbackForm = lazy(() => import("@/pages/portal/FreeTools/CallbackForm"));
const ServiceAreaMap = lazy(() => import("@/pages/portal/FreeTools/ServiceAreaMap"));

// ── Public / shareable artifacts ───────────────────────────────────────────
const OnboardingForm = lazy(() => import("@/pages/OnboardingForm"));
const ReviewFunnel = lazy(() => import("@/pages/ReviewFunnel"));
const ReviewQrLanding = lazy(() => import("@/pages/ReviewQrLanding"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPassword"));
const SignupPage = lazy(() => import("@/pages/Signup"));
const SignupBusinessNamePage = lazy(() => import("@/pages/SignupBusinessName"));
const BookingPage = lazy(() => import("@/pages/public/BookingPage"));
const PayInvoicePage = lazy(() => import("@/pages/public/PayInvoicePage"));
const QuoteSnapshotPage = lazy(() => import("@/pages/quote-snapshot"));
const ReviewSlugLanding = lazy(() => import("@/pages/ReviewSlugLanding"));
const InternalTemplateRender = lazy(() => import("@/pages/InternalTemplateRender"));

/**
 * Snapshot pipeline — Playwright-only render route.
 *
 * The `/internal/template-render/:templateId` page renders ONE template into
 * a real `<AdvancedCalculator>` at a fixed viewport so Playwright can grab a
 * PNG thumbnail (matches Elfsight's `<uuid>@2x.png` pattern). The route is
 * mounted ONLY when:
 *   - Vite is in dev mode (`import.meta.env.MODE === 'development'`), OR
 *   - The build was opted in via `VITE_ENABLE_TEMPLATE_RENDER=true`.
 *
 * Production builds skip the route entirely so the page is not reachable.
 */
const ENABLE_TEMPLATE_RENDER_ROUTE =
  import.meta.env.MODE === "development" ||
  import.meta.env.VITE_ENABLE_TEMPLATE_RENDER === "true";

/**
 * Root route. On a hosted-calculator subdomain ({slug}.your-quote.net) the
 * bare `/` shows that customer's calculator; everywhere else it's the
 * marketing home page.
 */
function RootRoute() {
  return hostedSlugFromHost() ? <Calculator /> : <MarketingHome />;
}

/**
 * Suspense fallback for lazy-loaded routes (Wizard, Calculator, FreeAudit).
 * Plain centered spinner — embed iframes auto-size to body, so this
 * keeps the host page from collapsing to zero-height while the chunk
 * downloads.
 */
function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "200px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
      }}
    >
      <div
        style={{
          width: "24px",
          height: "24px",
          border: "2px solid rgba(100, 116, 139, 0.25)",
          borderTopColor: "rgb(100, 116, 139)",
          borderRadius: "50%",
          animation: "qq-spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes qq-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Switch>
      <Route path="/" component={RootRoute} />

      {/* Snapshot pipeline (Playwright). Dev-only / opt-in via env. */}
      {ENABLE_TEMPLATE_RENDER_ROUTE && (
        <Route path="/internal/template-render/:templateId" component={InternalTemplateRender} />
      )}

      <Route path="/admin/ai">{() => <RequirePortal><AiDashboard /></RequirePortal>}</Route>
      <Route path="/admin/ai-gates">{() => <RequirePortal><AdminAiGatesPage /></RequirePortal>}</Route>
      <Route path="/admin/ai-channels">{() => <RequirePortal><AdminAiChannelsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/sales">{() => <RequirePortal><SalesPipelinePage /></RequirePortal>}</Route>
      <Route path="/admin/crm/socialsync">{() => <RequirePortal><SocialSyncOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/contentflow">{() => <RequirePortal><ContentFlowQueuePage /></RequirePortal>}</Route>
      <Route path="/admin/contentflow">{() => <Redirect to="/admin/crm/contentflow" />}</Route>
      <Route path="/admin/crm/clients/:id">{() => <RequirePortal><ClientDetailPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/clients">{() => <RequirePortal><ClientsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/inbox">{() => <RequirePortal><InboxPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/communications">{() => <RequirePortal><CommunicationsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/alerts">{() => <RequirePortal><SystemAlertsPage /></RequirePortal>}</Route>
      <Route path="/admin/content-pipeline">{() => <RequirePortal><ContentPipelinePage /></RequirePortal>}</Route>
      {/* Wave Q: short alias the docs / audits / Copilot deeplinks already
          reference. Mirrors the /admin/contentflow → /admin/crm/contentflow
          pattern above. */}
      <Route path="/admin/system-alerts">{() => <Redirect to="/admin/crm/alerts" />}</Route>
      <Route path="/admin/crm/audit-log">{() => <RequirePortal><AdminAuditLogPage /></RequirePortal>}</Route>
      {/* AI-3c audit log */}
      <Route path="/admin/audit-log">{() => <RequirePortal><AuditLogPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/audit-leads">{() => <RequirePortal><AuditLeadsPage /></RequirePortal>}</Route>
      <Route path="/admin/chat-history">{() => <RequirePortal><AdminChatHistoryPage /></RequirePortal>}</Route>
      <Route path="/admin/system/integrations">{() => <RequirePortal><IntegrationHealthPage /></RequirePortal>}</Route>
      <Route path="/admin/integrations/google">{() => <RequirePortal><SeoIntegrationsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/billing">{() => <RequirePortal><BillingPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/suppliers">{() => <RequirePortal><SuppliersPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/rankflow">{() => <RequirePortal><RankFlowOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/adflow">{() => <RequirePortal><AdFlowOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/tradeline-ops">{() => <RequirePortal><TradeLineOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/tradeline-setups">{() => <RequirePortal><TradelineSetupsPage /></RequirePortal>}</Route>
      <Route path="/admin/tradeline/templates">{() => <RequirePortal><TradelineTemplatesPage /></RequirePortal>}</Route>
      <Route path="/admin/tradeline/learning">{() => <RequirePortal><TradelineLearningPage /></RequirePortal>}</Route>
      <Route path="/admin/tradeline/voices">{() => <RequirePortal><TradelineVoicesPage /></RequirePortal>}</Route>
      <Route path="/admin/mobile-preview">{() => <RequirePortal><MobilePreviewPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/quotequick">{() => <RequirePortal><QuoteQuickPage /></RequirePortal>}</Route>
      <Route path="/admin/quotequick/trades/:id">{(params) => <RequirePortal><QuoteQuickTradeDetailPage tradeId={params.id} /></RequirePortal>}</Route>
      <Route path="/admin/quotequick/trades">{() => <RequirePortal><QuoteQuickTradesPage /></RequirePortal>}</Route>
      {/* AI-3b template editor routes */}
      <Route path="/admin/quotequick/templates/:id">{(params) => <RequirePortal><QuoteQuickTemplateDetailPage templateId={params.id} /></RequirePortal>}</Route>
      <Route path="/admin/quotequick/templates">{() => <RequirePortal><QuoteQuickTemplatesPage /></RequirePortal>}</Route>
      {/* AJ-4 API platform admin */}
      <Route path="/admin/api-platform/users/:userId">{(params) => <RequirePortal><ApiPlatformUserDetailPage userId={params.userId} /></RequirePortal>}</Route>
      <Route path="/admin/api-platform">{() => <RequirePortal><ApiPlatformPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/support/:id">{() => <RequirePortal><SupportTicketDetailPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/support">{() => <RequirePortal><SupportInboxPage /></RequirePortal>}</Route>
      <Route path="/admin/notices">{() => <RequirePortal><AdminNoticesPage /></RequirePortal>}</Route>
      {/* W-AN-2 Coming Soon waitlist */}
      <Route path="/admin/waitlist">{() => <RequirePortal><WaitlistPage /></RequirePortal>}</Route>
      <Route path="/admin/booking">{() => <RequirePortal><BookingCalendarPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/services">{() => <RequirePortal><ServicesPage /></RequirePortal>}</Route>
      <Route path="/admin/products/:id">{() => <RequirePortal><ProductDetailPage /></RequirePortal>}</Route>
      <Route path="/admin/service-ops">{() => <RequirePortal><ServiceOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/mapguard">{() => <RequirePortal><MapguardDashboard /></RequirePortal>}</Route>
      <Route path="/admin/crm/mapguard/ops">{() => <RequirePortal><MapguardOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/webcare/ops">{() => <RequirePortal><WebCareOpsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/ai-budget">{() => <RequirePortal><AiBudgetPage /></RequirePortal>}</Route>
      <Route path="/admin/ai-activity">{() => <RequirePortal><AdminAiActivityPage /></RequirePortal>}</Route>
      <Route path="/admin/ui-primitives">{() => <RequirePortal><UiPrimitivesDemo /></RequirePortal>}</Route>
      <Route path="/admin/crm/reviews">{() => <RequirePortal><ReviewsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/profile">{() => <RequirePortal><ProfilePage /></RequirePortal>}</Route>
      <Route path="/admin/crm/settings">{() => <RequirePortal><SettingsPage /></RequirePortal>}</Route>
      <Route path="/admin/crm/change-password">{() => <RequirePortal><ChangePasswordPage /></RequirePortal>}</Route>
      <Route path="/admin/crm">{() => <RequirePortal><CrmOverview /></RequirePortal>}</Route>
      <Route path="/admin">{() => <Redirect to="/admin/crm" />}</Route>

      {/* System monitoring */}
      <Route path="/admin/system/jobs">{() => <RequirePortal><SystemJobsPage /></RequirePortal>}</Route>
      <Route path="/admin/system/workers">{() => <RequirePortal><SystemWorkersPage /></RequirePortal>}</Route>
      <Route path="/admin/system/availability">{() => <RequirePortal><SystemAvailabilityPage /></RequirePortal>}</Route>

      {/* Outbound lead management */}
      <Route path="/admin/outbound/prospects">{() => <RequirePortal><ProspectsPage /></RequirePortal>}</Route>
      <Route path="/admin/outbound/campaigns">{() => <RequirePortal><CampaignsPage /></RequirePortal>}</Route>
      <Route path="/admin/outbound/sequences">{() => <RequirePortal><SequencesPage /></RequirePortal>}</Route>
      <Route path="/admin/outbound/pipeline">{() => <RequirePortal><PipelinePage /></RequirePortal>}</Route>
      <Route path="/admin/outbound">{() => <Redirect to="/admin/outbound/prospects" />}</Route>

      {/* Client portal */}
      <Route path="/portal/tradeline/dashboard">{() => <RequireClient><TradeLineDashboard /></RequireClient>}</Route>
      <Route path="/portal/tradeline/setup">{() => <RequireClient><TradelineSetupPage /></RequireClient>}</Route>
      <Route path="/portal/tradeline/knowledge">{() => <RequireClient><PortalTradelineKnowledgePage /></RequireClient>}</Route>
      <Route path="/portal/tradeline/voice">{() => <RequireClient><PortalTradelineVoicePage /></RequireClient>}</Route>
      <Route path="/portal/tradeline/email-domain/setup">{() => <RequireClient><PortalEmailDomainSetup /></RequireClient>}</Route>
      <Route path="/portal/tradeline/chat-widget/install">{() => <RequireClient><ChatWidgetInstallEntry /></RequireClient>}</Route>
      <Route path="/portal/tradeline/chat-widget/install-onboarding">{() => <RequireClient><ChatWidgetInstallOnboarding /></RequireClient>}</Route>
      <Route path="/admin/install-queue">{() => <RequirePortal><InstallQueuePage /></RequirePortal>}</Route>
      <Route path="/portal/tradeline/chat-widget">{() => <RequireClient><PortalChatWidgetSetup /></RequireClient>}</Route>
      <Route path="/portal/onboarding/:id">{() => <RequireClient><PortalOnboarding /></RequireClient>}</Route>
      <Route path="/portal/services/:id">{() => <RequireClient><PortalServiceDetail /></RequireClient>}</Route>
      {/* Wave 27: dashboard + alert-settings must mount BEFORE the parent
          /portal/mapguard route — wouter matches first-hit. */}
      <Route path="/portal/mapguard/dashboard">{() => <RequireClient><MapGuardDashboard /></RequireClient>}</Route>
      <Route path="/portal/mapguard/alert-settings">{() => <RequireClient><MapGuardAlertSettings /></RequireClient>}</Route>
      <Route path="/portal/mapguard">{() => <RequireClient><PortalMapguard /></RequireClient>}</Route>
      {/* Wave 28: ReputationShield UI upgrade. Dashboard + setup + notification
          settings — all mounted ABOVE the /portal/reviews legacy routes so
          wouter resolves them first. */}
      <Route path="/portal/reputationshield/dashboard">{() => <RequireClient><ReputationShieldDashboard /></RequireClient>}</Route>
      <Route path="/portal/reputationshield/setup">{() => <RequireClient><ReputationShieldSetup /></RequireClient>}</Route>
      <Route path="/portal/reputationshield/notifications">{() => <RequireClient><ReputationShieldNotificationSettings /></RequireClient>}</Route>
      <Route path="/portal/ai-insights">{() => <RequireClient><AiInsightsPage /></RequireClient>}</Route>
      <Route path="/portal/citation-tracker">{() => <RequireClient><CitationTrackerDashboard /></RequireClient>}</Route>
      <Route path="/portal/citation-builder">{() => <RequireClient><CitationBuilderDashboard /></RequireClient>}</Route>
      <Route path="/portal/services">{() => <RequireClient><PortalServices /></RequireClient>}</Route>
      <Route path="/portal/catalog">{() => <RequireClient><PortalCatalog /></RequireClient>}</Route>
      <Route path="/portal/reviews/widget">{() => <RequireClient><PortalWidget /></RequireClient>}</Route>
      <Route path="/portal/reviews/setup">{() => <RequireClient><PortalReviewsSetup /></RequireClient>}</Route>
      <Route path="/portal/reviews/competitors">{() => <RequireClient><PortalCompetitors /></RequireClient>}</Route>
      <Route path="/portal/reviews">{() => <RequireClient><PortalReviews /></RequireClient>}</Route>
      <Route path="/portal/rankflow/dashboard">{() => <RequireClient><RankFlowDashboard /></RequireClient>}</Route>
      <Route path="/portal/rankflow">{() => <RequireClient><PortalRankFlow /></RequireClient>}</Route>
      <Route path="/portal/articles">{() => <RequireClient><PortalArticles /></RequireClient>}</Route>
      <Route path="/portal/content-preferences">{() => <RequireClient><PortalContentPreferences /></RequireClient>}</Route>
      {/* ContentFlow Phase 1 — prompt-library picker. */}
      <Route path="/portal/contentflow/examples">{() => <RequireClient><ContentExamplesPage /></RequireClient>}</Route>
      <Route path="/portal/contentflow/dashboard">{() => <RequireClient><PortalContentFlowDashboard /></RequireClient>}</Route>
      <Route path="/portal/contentflow">{() => <RequireClient><PortalContentFlow /></RequireClient>}</Route>
      <Route path="/portal/billing">{() => <RequireClient><PortalBilling /></RequireClient>}</Route>
      <Route path="/portal/help/tickets/:id">{() => <RequireClient><PortalTicketDetail /></RequireClient>}</Route>
      <Route path="/portal/socialsync-setup">{() => <RequireClient><SocialSyncSetup /></RequireClient>}</Route>
      <Route path="/portal/socialsync/dashboard">{() => <RequireClient><SocialSyncDashboard /></RequireClient>}</Route>
      <Route path="/portal/socialsync">{() => <RequireClient><PortalSocialSync /></RequireClient>}</Route>
      <Route path="/portal/reputation">{() => <Redirect to="/portal/reviews" />}</Route>
      <Route path="/portal/dispatch">{() => <RequireClient><DispatchPage /></RequireClient>}</Route>
      <Route path="/portal/invoices/:id">{() => <RequireClient><InvoiceDetailPage /></RequireClient>}</Route>
      <Route path="/portal/invoices">{() => <RequireClient><InvoicesPage /></RequireClient>}</Route>
      <Route path="/portal/payment-methods">{() => <RequireClient><PaymentMethodsPage /></RequireClient>}</Route>
      <Route path="/portal/bookflow-setup">{() => <RequireClient><BookFlowSetupPage /></RequireClient>}</Route>
      {/* AJ-5 portal API access */}
      <Route path="/portal/api-access">{() => <RequireClient><PortalApiAccessPage /></RequireClient>}</Route>
      {/* W-AO-6d — Brand Kits portal page (QuoteQuick $29 upsell) */}
      <Route path="/portal/brand-kits">{() => <RequireClient><PortalBrandKitsPage /></RequireClient>}</Route>
      {/* Free Tools — foundation wave (index + Schema Generator) */}
      <Route path="/portal/free-tools/schema">{() => <RequireClient><SchemaGenerator /></RequireClient>}</Route>
      <Route path="/portal/free-tools/faq">{() => <RequireClient><FaqWidget /></RequireClient>}</Route>
      <Route path="/portal/free-tools/hours">{() => <RequireClient><HoursWidget /></RequireClient>}</Route>
      <Route path="/portal/free-tools/trust-badges">{() => <RequireClient><TrustBadges /></RequireClient>}</Route>
      <Route path="/portal/free-tools/review-link">{() => <RequireClient><ReviewLink /></RequireClient>}</Route>
      <Route path="/portal/free-tools/callback">{() => <RequireClient><CallbackForm /></RequireClient>}</Route>
      <Route path="/portal/free-tools/service-area">{() => <RequireClient><ServiceAreaMap /></RequireClient>}</Route>
      <Route path="/portal/free-tools">{() => <RequireClient><FreeToolsIndex /></RequireClient>}</Route>
      <Route path="/portal/help">{() => <RequireClient><PortalHelp /></RequireClient>}</Route>
      <Route path="/portal/chat-history">{() => <RequireClient><PortalChatHistoryPage /></RequireClient>}</Route>
      <Route path="/portal/settings">{() => <RequireClient><PortalSettings /></RequireClient>}</Route>
      {/* Wave W-BB-4 — per-calculator conversion analytics dashboard */}
      <Route path="/portal/calculators/:id/analytics">{() => <RequireClient><PortalCalculatorAnalytics /></RequireClient>}</Route>
      <Route path="/portal">{() => <RequireClient><PortalDashboard /></RequireClient>}</Route>

      <Route path="/compare/reputationshield-vs-nicejob" component={CompareNiceJob} />
      <Route path="/compare/:slug" component={ComparisonPage} />
      {/* MapGuard renders through the shared EffortelProductPage template
          (the /products/:slug route below) so all 12 product pages follow the
          same hero → trust → cards → how-it-works → proof → CTA rhythm.
          MapGuard copy lives in config/products.ts + config/product-mockups. */}
      {/* TradeLine variant comparison — internal review pages, registered before /:slug */}
      {/* TradeLine consolidation — old routes redirect to unified product */}
      <Route path="/products/assistants">{() => <Redirect to="/products/tradeline" />}</Route>
      <Route path="/products/ai-chat">{() => <Redirect to="/products/tradeline" />}</Route>
      <Route path="/products/ai-voice">{() => <Redirect to="/products/tradeline" />}</Route>
      <Route path="/products/tradeline-complete">{() => <Redirect to="/products/tradeline" />}</Route>
      {/* QuoteQuick slug consolidation */}
      <Route path="/products/quickquote">{() => <Redirect to="/products/quickquotepro" />}</Route>
      <Route path="/products/quotequick">{() => <Redirect to="/products/quickquotepro" />}</Route>
      {/* Removed products — redirect to closest active product */}
      <Route path="/products/booking-addon">{() => <Redirect to="/products/quickquotepro" />}</Route>
      <Route path="/products/fix-and-optimize">{() => <Redirect to="/pricing" />}</Route>
      <Route path="/products/:slug">{(params) => <EffortelProductPage slug={params.slug} />}</Route>
      <Route path="/products" component={ProductIndex} />

      <Route path="/solutions/visibility" component={SolutionsVisibility} />
      <Route path="/solutions/:slug" component={SolutionPage} />

      <Route path="/demos" component={DemoCenter} />
      <Route path="/demos/socialsync" component={SocialSyncDemo} />
      <Route path="/demos/rankflow" component={RankFlowDemo} />
      <Route path="/demos/reputationshield" component={ReputationShieldDemo} />
      <Route path="/demos/:slug" component={DemoPage} />

      <Route path="/product/:slug">{(params) => <Redirect to={`/products/${params.slug}`} />}</Route>
      <Route path="/product">{() => <Redirect to="/products" />}</Route>
      <Route path="/platform">{() => <Redirect to="/products/quickquotepro" />}</Route>
      <Route path="/pricing" component={PricingUnified} />
      <Route path="/pricing/quotequick" component={QuoteQuickPricing} />
      <Route path="/plans">{() => <Redirect to="/pricing" />}</Route>
      <Route path="/checkout/success" component={CheckoutSuccess} />
      <Route path="/checkout/cancelled" component={CheckoutCancelled} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/signup/business" component={SignupBusinessNamePage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/services" component={MarketingServices} />
      <Route path="/bundles">{() => <Redirect to="/pricing" />}</Route>
      <Route path="/templates/:slug" component={MarketingTemplateDetail} />
      <Route path="/templates" component={MarketingTemplates} />
      <Route path="/resources" component={Resources} />
      <Route path="/design-showcase" component={DesignShowcase} />
      <Route path="/about" component={About} />
      <Route path="/blog" component={Blog} />
      <Route path="/case-studies" component={CaseStudies} />
      {/* Audience landing pages (Brightlocal-style) */}
      <Route path="/for-agencies" component={ForAgenciesPage} />
      <Route path="/for-franchises" component={ForFranchisesPage} />
      <Route path="/for-solo-traders" component={ForSoloTradersPage} />
      {/* Competitor comparison pages — "X alternative" / "X vs Y" SEO. */}
      <Route path="/wefixtrades-vs-jobber" component={CompareVsJobber} />
      <Route path="/wefixtrades-vs-housecall-pro" component={CompareVsHousecallPro} />
      <Route path="/wefixtrades-vs-servicetitan" component={CompareVsServiceTitan} />
      {/* Human-friendly HTML sitemap (XML lives at /sitemap.xml, server route) */}
      <Route path="/sitemap" component={SitemapPage} />
      {/* Wave 11D D5 — MapGuard Suite overview + Free Tools hub. */}
      <Route path="/mapguard-suite" component={MapGuardSuitePage} />
      <Route path="/free-tools" component={FreeToolsHubPage} />

      <Route path="/demo/:templateId" component={DemoTemplate} />
      <Route path="/demo" component={MarketingDemo} />

      <Route path="/docs" component={MarketingDocs} />
      <Route path="/contact" component={MarketingContact} />
      <Route path="/privacy" component={MarketingPrivacy} />
      <Route path="/terms" component={MarketingTerms} />
      <Route path="/features/instant-quotes" component={FeatureInstantQuotes} />
      <Route path="/features/booking" component={FeatureBooking} />
      <Route path="/features/ai-employee" component={FeatureAiEmployee} />
      <Route path="/features/sms" component={FeatureSms} />
      <Route path="/features/calculator-engine" component={FeatureCalculatorEngine} />
      <Route path="/docs/embed" component={DocsEmbed} />
      <Route path="/docs/domain" component={DocsDomain} />
      <Route path="/docs/booking" component={DocsBooking} />
      <Route path="/docs/ai" component={DocsAi} />
      <Route path="/docs/mapguard" component={DocsMapguard} />
      <Route path="/docs/reputationshield" component={DocsReputationShield} />
      <Route path="/docs/webhooks" component={DocsWebhooks} />
      <Route path="/docs/troubleshooting" component={DocsTroubleshooting} />
      {/* AJ-7 API docs */}
      <Route path="/docs/api">{() => <ApiDocsPage />}</Route>
      <Route path="/dev/primitives">{() => <RequirePortal><PrimitivesPage /></RequirePortal>}</Route>
      <Route path="/dev/canvas">{() => <RequirePortal><DemoCanvas /></RequirePortal>}</Route>
      {/* Tools-consolidation (2026-05-23) — the marketing /tools/* surface
          consolidated to a single Free Audit page. Live routes: */}
      <Route path="/tools/free-audit" component={FreeAudit} />
      {/* Free Tools Wave 1 — Brightlocal-style standalone tools. Each is a
          public lead-magnet page with its own /tools/* URL, form, result
          panel, and cross-link back to the paid Full Audit. */}
      <Route path="/tools/google-review-link-generator" component={GoogleReviewLinkGenerator} />
      {/* Wave 6E — canonical SERP Checker. The older /tools/local-search-checker
          301s to this URL (see legacy redirects below). */}
      <Route path="/tools/local-serp-checker" component={LocalSerpChecker} />
      {/* Wave 6F — multi-engine single-business rank tracker. Distinct from
          /tools/local-rank-grid (which is a 5x5 geo-grid heatmap). */}
      <Route path="/tools/local-rank-tracker" component={LocalRankTracker} />
      <Route path="/tools/citation-checker" component={CitationChecker} />
      <Route path="/tools/local-rankflux" component={LocalRankflux} />
      {/* Wave 2 SEO surfaces — Local Rank Grid (free) + Citation Builder (paid service). */}
      <Route path="/tools/local-rank-grid" component={LocalRankGrid} />
      <Route path="/citation-builder" component={CitationBuilderPage} />
      <Route path="/citation-tracker" component={CitationTrackerPage} />
      {/* ContentFlow Phase 1 — public prompt-library SEO landings.
          One route per seed trade so wouter can match the `-ai-content-prompts`
          literal suffix without a regex param. The TradePromptsPage reads
          the slug via :trade and 404s if it's not in TRADE_META. */}
      <Route path="/tools/plumbing-ai-content-prompts">{() => <TradePromptsPage />}</Route>
      <Route path="/tools/hvac-ai-content-prompts">{() => <TradePromptsPage />}</Route>
      <Route path="/tools/electrical-ai-content-prompts">{() => <TradePromptsPage />}</Route>
      <Route path="/tools/roofing-ai-content-prompts">{() => <TradePromptsPage />}</Route>
      <Route path="/tools/landscaping-ai-content-prompts">{() => <TradePromptsPage />}</Route>
      {/* ContentFlow standalone marketing landing — public, no auth.
          Speaks to marketers / agencies / creators / trades equally.
          The 12-pattern trade landings above remain the per-trade SEO
          entry-points. */}
      <Route path="/contentflow">{() => <ContentFlowStandalone />}</Route>
      {/* Quote Demo + Build-with-AI relocated under QuoteQuick */}
      <Route path="/products/quickquotepro/demo" component={QuoteCalculatorDemo} />
      <Route path="/products/quickquotepro/build-with-ai/preview" component={BuildWithAiPreview} />
      <Route path="/products/quickquotepro/build-with-ai" component={BuildWithAi} />
      {/* Deprecated /tools/* routes — all 301 to the Free Audit so existing
          inbound links + SEO equity flow to the surviving surface. The
          MapSnapshot grid lives inside the Free Audit's "Rank Grid" tab. */}
      <Route path="/tools/missed-call-calculator/:trade">{() => <Redirect to="/tools/free-audit" />}</Route>
      <Route path="/tools/missed-call-calculator">{() => <Redirect to="/tools/free-audit" />}</Route>
      <Route path="/tools/map-snapshot/:tradeSlug">{() => <Redirect to="/tools/free-audit" />}</Route>
      <Route path="/tools/map-snapshot">{() => <Redirect to="/tools/free-audit" />}</Route>
      <Route path="/snapshot/:slug">{() => <Redirect to="/tools/free-audit" />}</Route>
      {/* Wave 6E — old slug 301s to the new canonical SERP Checker URL so
          existing inbound links + SEO equity flow to the surviving page. */}
      <Route path="/tools/local-search-checker">{() => <Redirect to="/tools/local-serp-checker" />}</Route>
      <Route path="/tools/quote-demo">{() => <Redirect to="/products/quickquotepro/demo" />}</Route>
      <Route path="/tools/build-with-ai/preview">{() => <Redirect to="/products/quickquotepro/build-with-ai/preview" />}</Route>
      <Route path="/tools/build-with-ai">{() => <Redirect to="/products/quickquotepro/build-with-ai" />}</Route>
      <Route path="/tools">{() => <Redirect to="/tools/free-audit" />}</Route>
      {/* Legacy bare routes — redirect to canonical destinations */}
      <Route path="/missed-call-calculator">{() => <Redirect to="/tools/free-audit" />}</Route>
      <Route path="/quote-demo">{() => <Redirect to="/products/quickquotepro/demo" />}</Route>
      <Route path="/free-audit">{() => <Redirect to="/tools/free-audit" />}</Route>
      <Route path="/onboarding/:token" component={OnboardingForm} />
      <Route path="/review/qr/:widgetToken" component={ReviewQrLanding} />
      <Route path="/review/:token" component={ReviewFunnel} />
      {/* Free-tools batch 2 — public review-funnel landing page (/r/:slug). */}
      <Route path="/r/:slug" component={ReviewSlugLanding} />
      <Route path="/audit/report/:id" component={SharedAuditReport} />
      <Route path="/book/:slug" component={BookingPage} />
      <Route path="/pay/:token" component={PayInvoicePage} />
      {/* Wave R3 — public shareable quote URL (snapshot pattern). */}
      <Route path="/q/:slug" component={QuoteSnapshotPage} />
      <Route path="/wizard/legacy" component={WizardLegacy} />
      <Route path="/wizard" component={Wizard} />
      <Route path="/calculator" component={Calculator} />
      <Route path="/edit-calculator" component={EditCalculator} />
      <Route path="/leads" component={LeadsPage} />
      <Route path="/dashboard" component={Dashboard} />
      {/* Redirect legacy uppercase routes to canonical lowercase */}
      <Route path="/Wizard/legacy">{() => <Redirect to="/wizard/legacy" />}</Route>
      <Route path="/Wizard">{() => <Redirect to="/wizard" />}</Route>
      <Route path="/Calculator">{() => <Redirect to="/calculator" />}</Route>
      <Route path="/EditCalculator">{() => <Redirect to="/edit-calculator" />}</Route>
      <Route path="/Leads">{() => <Redirect to="/leads" />}</Route>
      <Route path="/Dashboard">{() => <Redirect to="/dashboard" />}</Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <CopilotFormProvider>
              <Toaster />
              {/* Global impersonation banner — only renders when an admin
                  has an active "view as customer" session. Sticky top-0
                  so it appears above every route's chrome. */}
              <ImpersonateBanner />
              <Router />
            </CopilotFormProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}

export default App;
