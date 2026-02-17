import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, ShieldCheck, Banknote, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVisitorTracking } from "@/hooks/use-visitor-tracking";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  useVisitorTracking("home");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login_error") === "1") {
      window.history.replaceState({}, "", "/");
      toast({
        title: "Login failed",
        description: "Something went wrong. Please try again by clicking Get Started.",
        variant: "destructive",
      });
    }
  }, []);

  if (isAuthenticated) {
    setLocation("/jobs");
    return null;
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto space-y-8">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
              #1 Marketplace for Quick Jobs in Nigeria
            </div>
            
            <h1 className="text-5xl md:text-7xl font-display font-bold text-foreground tracking-tight leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
              Get Jobs Done or <br />
              <span className="text-primary relative inline-block">
                Earn Money
                <svg className="absolute w-full h-3 -bottom-1 left-0 text-accent/30 -z-10" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span> Today with <span className="text-primary">ABIB JOBS</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
              Connect with verified workers for cleaning, repairs, and errands. 
              We hold payments in escrow so everyone stays safe.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
              <Button asChild size="lg" className="h-14 px-8 text-lg rounded-2xl bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 hover:scale-105 transition-all">
                <a href="/auth">Post a Job Now</a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 px-8 text-lg rounded-2xl border-2 hover:bg-muted/50 transition-all">
                <a href="/auth">Find Work</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-secondary/30 border-y border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: ShieldCheck,
                title: "Secure Escrow",
                desc: "Money is held safely by us until the job is completed to your satisfaction."
              },
              {
                icon: CheckCircle2,
                title: "Verified Users",
                desc: "Every worker must verify their identity with a valid Nigerian ID card."
              },
              {
                icon: Clock,
                title: "Quick Service",
                desc: "Find someone nearby to help you with tasks in minutes, not days."
              }
            ].map((feature, i) => (
              <div key={i} className="bg-background rounded-3xl p-8 border border-border/50 shadow-sm hover:shadow-xl transition-all duration-300 group">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold font-display mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-primary rounded-[2.5rem] p-12 md:p-24 text-center relative overflow-hidden shadow-2xl shadow-primary/25">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay" />
            
            <div className="relative z-10 max-w-3xl mx-auto space-y-8">
              <h2 className="text-4xl md:text-5xl font-display font-bold text-white">
                Ready to get started?
              </h2>
              <p className="text-primary-foreground/80 text-xl">
                Join thousands of Nigerians using ABIB JOBS to simplify their lives.
              </p>
              <Button asChild size="lg" className="h-14 px-10 bg-white text-primary hover:bg-white/90 text-lg font-bold rounded-2xl shadow-lg border-2 border-transparent hover:border-white/50 transition-all">
                <a href="/auth">
                  Create Free Account <ArrowRight className="ml-2 w-5 h-5" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="ABIB JOBS Logo" className="w-8 h-8 rounded-lg" />
                <span className="font-display font-bold text-xl">ABIB JOBS</span>
              </div>
            <span className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} ABIB JOBS Nigeria. All rights reserved.
            </span>
        </div>
      </footer>
    </div>
  );
}
