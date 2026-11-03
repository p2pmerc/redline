import { useLocation, useNavigate } from "react-router-dom";
import { Robot } from "@phosphor-icons/react";
import { RedlineMark } from "@/components/redline-logo";
import { ProfileForm } from "@/components/profile/profile-form";
import { useToast } from "@/components/feedback/toast-provider";
import { useProfile } from "@/lib/profile-context";
import { useSession } from "@/lib/auth-context";

export function WelcomePage() {
  const { profile, setProfile } = useProfile();
  const { displayName } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const from = (location.state as { from?: string } | null)?.from;

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 py-12 sm:py-16">
      <RedlineMark className="size-10" />
      <h1 className="mt-5 text-[1.75rem] font-semibold leading-tight tracking-tight">{profile ? "Your profile" : "Set up your researcher profile"}</h1>
      <p className="mt-2 flex items-start gap-2 text-body text-muted-foreground">
        <Robot size={18} className="mt-0.5 shrink-0" />
        Security teams and the public see this next to the reports you disclose. Your sealed reports stay private to you and the people you invite.
      </p>
      <div className="mt-8">
        <ProfileForm initial={profile} suggestedName={displayName} submitLabel="Save and continue"
          onSaved={(saved) => { setProfile(saved); toast.show({ tone: "success", title: "Profile saved" }); navigate(from && from !== "/app/welcome" ? from : "/app", { replace: true }); }} />
      </div>
    </div>
  );
}
