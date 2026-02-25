import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Wizard from "@/pages/wizard";
import Calculator from "@/pages/calculator";
import EditCalculator from "@/pages/edit-calculator";
import LeadsPage from "@/pages/leads";
import Dashboard from "@/pages/dashboard";
import MarketingHome from "@/pages/marketing/home";
import MarketingProduct from "@/pages/marketing/product";
import MarketingPricing from "@/pages/marketing/pricing";
import MarketingServices from "@/pages/marketing/services";
import MarketingBundles from "@/pages/marketing/bundles";
import MarketingTemplates from "@/pages/marketing/templates";
import MarketingDemo from "@/pages/marketing/demo";
import MarketingDocs from "@/pages/marketing/docs";
import MarketingContact from "@/pages/marketing/contact";
import MarketingPrivacy from "@/pages/marketing/privacy";
import MarketingTerms from "@/pages/marketing/terms";
import FeatureInstantQuotes from "@/pages/marketing/features/instant-quotes";
import FeatureBooking from "@/pages/marketing/features/booking";
import FeatureAiEmployee from "@/pages/marketing/features/ai-employee";
import FeatureSms from "@/pages/marketing/features/sms";
import FeatureCalculatorEngine from "@/pages/marketing/features/calculator-engine";
import DocsEmbed from "@/pages/marketing/docs/embed";
import DocsDomain from "@/pages/marketing/docs/domain";
import DocsBooking from "@/pages/marketing/docs/booking";
import DocsAi from "@/pages/marketing/docs/ai";
import DocsWebhooks from "@/pages/marketing/docs/webhooks";
import DocsTroubleshooting from "@/pages/marketing/docs/troubleshooting";

function Router() {
  return (
    <Switch>
      <Route path="/" component={MarketingHome} />
      <Route path="/product" component={MarketingProduct} />
      <Route path="/pricing" component={MarketingPricing} />
      <Route path="/services" component={MarketingServices} />
      <Route path="/bundles" component={MarketingBundles} />
      <Route path="/templates" component={MarketingTemplates} />
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
      <Route path="/docs/webhooks" component={DocsWebhooks} />
      <Route path="/docs/troubleshooting" component={DocsTroubleshooting} />
      <Route path="/Wizard" component={Wizard} />
      <Route path="/Calculator" component={Calculator} />
      <Route path="/EditCalculator" component={EditCalculator} />
      <Route path="/Leads" component={LeadsPage} />
      <Route path="/Dashboard" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
