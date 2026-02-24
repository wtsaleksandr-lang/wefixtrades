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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Wizard} />
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
