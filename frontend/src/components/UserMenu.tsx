import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import styles from "./UserMenu.module.scss";

export function UserMenu() {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/login");
  };

  if (!user) return null;

  const initials = (user.name || user.email)
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className={styles.wrapper}>
      <button onClick={() => setOpen(!open)} className={styles.trigger}>
        <div className={styles.avatar}>{initials}</div>
        <ChevronDown size={14} className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} />
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.header}>
            <div className={styles.headerName}>{user.name}</div>
            <div className={styles.headerEmail}>{user.email}</div>
            {tenant && (
              <div className={styles.headerTenant}>{tenant.name}</div>
            )}
          </div>
          <div className={styles.divider} />
          <button
            className={styles.item}
            onClick={() => { setOpen(false); navigate("/settings?tab=profile"); }}
          >
            <User size={14} />
            Profile & Password
          </button>
          <button
            className={styles.item}
            onClick={() => { setOpen(false); navigate("/settings?tab=cloud"); }}
          >
            <Settings size={14} />
            Settings
          </button>
          <div className={styles.divider} />
          <button className={`${styles.item} ${styles.itemDanger}`} onClick={handleLogout}>
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
