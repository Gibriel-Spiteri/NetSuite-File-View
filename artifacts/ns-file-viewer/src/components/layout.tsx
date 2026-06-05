import { Link, useLocation } from "wouter";
import { Database, FileText, HardDrive, LayoutDashboard, Settings } from "lucide-react";
import { useGetDataStatus } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: status } = useGetDataStatus();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col flex-shrink-0">
        <div className="h-14 flex items-center px-4 font-bold border-b border-sidebar-border gap-2">
          <Database className="h-5 w-5" />
          <span>Record-File Viewer</span>
        </div>
        <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
          <NavItem href="/" icon={LayoutDashboard} label="Dashboard" active={location === "/"} />
          <NavItem href="/records" icon={HardDrive} label="Records" active={location === "/records"} />
          <NavItem href="/files" icon={FileText} label="Files" active={location === "/files"} />
          <div className="mt-auto flex flex-col gap-1">
            <NavItem href="/upload" icon={Database} label="Data Sources" active={location === "/upload"} />
            <NavItem href="/netsuite" icon={Settings} label="NetSuite Config" active={location === "/netsuite"} />
          </div>
        </nav>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-card border-b flex items-center px-6 shrink-0 justify-between">
          <div className="font-semibold text-lg text-foreground">
            {location === "/" && "Dashboard"}
            {location === "/records" && "Records"}
            {location === "/files" && "Files"}
            {location === "/upload" && "Data Sources"}
            {location === "/netsuite" && "NetSuite Configuration"}
          </div>
          <div className="flex items-center gap-4 text-sm">
            {status && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                {status.allFilesLoaded && status.recordAttachmentsLoaded ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Data Loaded
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Missing Data
                  </span>
                )}
              </div>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: React.ElementType; label: string; active: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
