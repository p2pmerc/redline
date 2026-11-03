import { ArrowSquareOut } from "@phosphor-icons/react";
import { ProfileForm } from "@/components/profile/profile-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/toast-provider";
import { useProfile } from "@/lib/profile-context";

export function SettingsPage() {
  const { profile, setProfile } = useProfile();
  const toast = useToast();
  return (
    <div className="max-w-xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">Settings</h1>
          <p className="text-body text-muted-foreground">Your researcher profile. Only disclosed and paid reports appear on your public page.</p>
        </div>
        {profile && <Button variant="secondary" trailingIcon={ArrowSquareOut} render={<a href={`/researchers/${profile.handle}`} target="_blank" rel="noreferrer" />}>View public page</Button>}
      </div>
      <ProfileForm initial={profile} submitLabel="Save changes" onSaved={(saved) => { setProfile(saved); toast.show({ tone: "success", title: "Profile updated" }); }} />
    </div>
  );
}
