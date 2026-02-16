import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { 
  Menu, 
  X, 
  Briefcase, 
  Wallet, 
  User, 
  LogOut,
  TrendingUp
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();

  const { data: profile } = useQuery({
    queryKey: [api.profile.get.path],
    queryFn: async () => {
      const res = await fetch(api.profile.get.path, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const isAdmin = profile?.role === 'admin';

  const navLinks = [
    { href: "/jobs", label: "Find Jobs", icon: Briefcase },
    { href: "/wallet", label: "Wallet", icon: Wallet },
    ...(isAdmin ? [{ href: "/admin/earnings", label: "Earnings", icon: TrendingUp }] : []),
  ];

  return (
    <nav className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/logo.png" alt="ABIB JOBS Logo" className="w-10 h-10 rounded-xl shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform" />
            <div className="flex flex-col">
              <span className="font-display font-bold text-xl leading-none text-foreground tracking-tight">ABIB JOBS</span>
              <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">Nigeria</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-1">
            {isAuthenticated ? (
              <>
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = location === link.href;
                  return (
                    <Link key={link.href} href={link.href}>
                      <span className={`
                        flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                        ${isActive 
                          ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20" 
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"}
                      `}>
                        <Icon className="w-4 h-4 mr-2" />
                        {link.label}
                      </span>
                    </Link>
                  );
                })}
                
                <div className="h-6 w-px bg-border mx-2" />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full ring-2 ring-transparent hover:ring-primary/20 transition-all">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user?.profileImageUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                          {user?.firstName?.[0] || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <Link href="/profile">
                      <DropdownMenuItem className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </DropdownMenuItem>
                    </Link>
                    {isAdmin && (
                      <Link href="/admin/earnings">
                        <DropdownMenuItem className="cursor-pointer">
                          <TrendingUp className="mr-2 h-4 w-4" />
                          <span>Platform Earnings</span>
                        </DropdownMenuItem>
                      </Link>
                    )}
                    <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => logout()}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button asChild className="bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20 rounded-xl px-6 font-semibold">
                <a href="/api/login">Login / Sign Up</a>
              </Button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="px-4 py-6 space-y-4">
            {isAuthenticated ? (
              <>
                <div className="flex items-center space-x-3 px-2 mb-6">
                  <Avatar className="h-12 w-12 border-2 border-primary/20">
                    <AvatarImage src={user?.profileImageUrl || undefined} />
                    <AvatarFallback>{user?.firstName?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-lg">{user?.firstName} {user?.lastName}</p>
                    <p className="text-sm text-muted-foreground truncate max-w-[200px]">{user?.email}</p>
                  </div>
                </div>
                
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href} onClick={() => setIsOpen(false)}>
                    <div className={`flex items-center p-3 rounded-xl ${location === link.href ? "bg-primary/10 text-primary" : "text-foreground"}`}>
                      <link.icon className="w-5 h-5 mr-3" />
                      <span className="font-medium">{link.label}</span>
                    </div>
                  </Link>
                ))}
                
                <Link href="/profile" onClick={() => setIsOpen(false)}>
                  <div className="flex items-center p-3 rounded-xl text-foreground">
                    <User className="w-5 h-5 mr-3" />
                    <span className="font-medium">Profile</span>
                  </div>
                </Link>

                <Button 
                  variant="destructive" 
                  className="w-full mt-4 rounded-xl"
                  onClick={() => logout()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Log Out
                </Button>
              </>
            ) : (
              <div className="p-4 bg-muted/30 rounded-2xl text-center">
                <p className="mb-4 text-muted-foreground">Join thousands of Nigerians earning daily.</p>
                <Button asChild className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl h-12 text-lg">
                  <a href="/api/login">Get Started</a>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
