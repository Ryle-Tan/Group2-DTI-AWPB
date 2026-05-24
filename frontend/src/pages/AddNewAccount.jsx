import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { getPasswordPolicyError, PASSWORD_POLICY_MESSAGE } from "@/lib/passwordPolicy";

import { usersService } from "@/services/supabaseService";



const EMPTY_FORM = {

  username: "enc_",

  fullName: "",

  email: "",

  password: "",

  confirmPassword: "",

  role: "encoder",

};



export default function AddNewAccount({

  accounts = [],

  onAddAccount,

  onShowToast,

}) {

  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);

  const [errors, setErrors] = useState({});

  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);



  const handleFieldChange = (event) => {

    const { name, value } = event.target;



    if (name === "role") {

      setForm((prev) => ({

        ...prev,

        role: value,

        username: updateUsernamePrefix(prev.username, value),

      }));

      return;

    }



    setForm((prev) => ({

      ...prev,

      [name]: value,

    }));

  };



  const handleCancel = () => {

    navigate("/admin/manage-accounts");

  };



  const handleSave = async () => {

    const nextErrors = {};

    const normalizedUsername = form.username.trim().toLowerCase();
    const normalizedEmail = form.email.trim().toLowerCase();



    if (!normalizedUsername) {

      nextErrors.username = "Username is required.";

    } else if (!/^(enc|adm)_[a-z0-9_]+$/.test(normalizedUsername)) {

      nextErrors.username =

        "Use a username like enc_jdelacruz or adm_jdelacruz.";

    } else if (

      (form.role === "encoder" && !normalizedUsername.startsWith("enc_")) ||

      (form.role === "admin" && !normalizedUsername.startsWith("adm_"))

    ) {

      nextErrors.username =

        form.role === "encoder"

          ? "Account Officer accounts must use the enc_ prefix."

          : "Admin accounts must use the adm_ prefix.";

    } else if (

      accounts.some((account) => account.username?.trim().toLowerCase() === normalizedUsername)

    ) {

      nextErrors.username =

        "This username is already assigned to another account.";

    }



    if (!form.fullName.trim()) {

      nextErrors.fullName = "Full name is required.";

    }



    if (!normalizedEmail) {

      nextErrors.email = "Email is required.";
    } else if (
      accounts.some(
        (account) =>
          account.email?.trim().toLowerCase() === normalizedEmail,
      )
    ) {
      nextErrors.email = "This email is already assigned to another account.";

    }



    const passwordError = getPasswordPolicyError(form.password, { required: true });

    if (passwordError) {
      nextErrors.password = passwordError;
    }



    if (!form.confirmPassword) {

      nextErrors.confirmPassword = "Please confirm the password.";

    } else if (form.password !== form.confirmPassword) {

      nextErrors.confirmPassword = "Passwords do not match.";

    }



    setErrors(nextErrors);



    if (Object.keys(nextErrors).length === 0) {

      const createdName = form.fullName.trim();



      setIsSaving(true);

      try {
        const createdProfile = await usersService.create({
          username: normalizedUsername,
          fullName: form.fullName.trim(),
          email: normalizedEmail,
          password: form.password,
          role: form.role,
        });

        onAddAccount?.({
          id: createdProfile.id,
          username: createdProfile.username,
          fullName: createdProfile.full_name,
          email: createdProfile.email,
          role: createdProfile.role,
          status: createdProfile.status,
        });

        onShowToast?.({
          title: "Account created",
          description: `${createdName} was added to All Accounts.`,
          type: "success",
        });

        navigate("/admin/manage-accounts");
      } catch (error) {
        setErrors({ email: error.message || "Could not create account." });
      } finally {
        setIsSaving(false);
      }

    }

  };



  return (

    <div className="space-y-6">

      <div>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900">

          Add New Users

        </h1>

        <p className="mt-1 text-sm text-slate-500">

          Create a new user account for the AWPB system.

        </p>

      </div>



      <Card className="overflow-hidden border-0 shadow-[0_10px_24px_rgba(15,23,42,0.08)] gap-0 py-0">

        <CardHeader className="border-b bg-white px-6 pt-5 pb-4 md:px-8">

          <CardTitle className="text-2xl">Create New User Account</CardTitle>

          <p className="mt-1 text-sm text-slate-500">

            Fill in the account details and assign the proper access role.

          </p>

        </CardHeader>



        <CardContent className="px-6 py-6 md:px-8 md:py-7">

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:gap-10">

            <div className="space-y-5">

              <div>

                <label className="mb-2 block text-sm font-semibold text-slate-700">

                  Username

                </label>

                <Input

                  name="username"

                  value={form.username}

                  onChange={handleFieldChange}

                  placeholder="enc_jdelacruz"

                  className="h-11 rounded-xl border-slate-200 bg-white px-4"

                />

                {errors.username && (

                  <p className="mt-1 text-xs text-red-600">{errors.username}</p>

                )}

              </div>



              <div>

                <label className="mb-2 block text-sm font-semibold text-slate-700">

                  Full Name

                </label>

                <Input

                  name="fullName"

                  value={form.fullName}

                  onChange={handleFieldChange}

                  placeholder="Enter full name"

                  className="h-11 rounded-xl border-slate-200 bg-white px-4"

                />

                {errors.fullName && (

                  <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>

                )}

              </div>



              <div>

                <label className="mb-2 block text-sm font-semibold text-slate-700">

                  Email

                </label>

                <Input

                  name="email"

                  type="email"

                  value={form.email}

                  onChange={handleFieldChange}

                  placeholder="Enter email"

                  className="h-11 rounded-xl border-slate-200 bg-white px-4"

                />

                {errors.email && (

                  <p className="mt-1 text-xs text-red-600">{errors.email}</p>

                )}

              </div>



              <div>

                <label className="mb-2 block text-sm font-semibold text-slate-700">

                  Password

                </label>

                <div className="relative">
                  <Input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={handleFieldChange}
                    placeholder="New password"
                    className="h-11 rounded-xl border-slate-200 bg-white px-4 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {errors.password && (

                  <p className="mt-1 text-xs text-red-600">{errors.password}</p>

                )}

                <p className="mt-2 text-xs text-slate-500">
                  {PASSWORD_POLICY_MESSAGE}
                </p>

              </div>



              <div>

                <label className="mb-2 block text-sm font-semibold text-slate-700">

                  Confirm Password

                </label>

                <div className="relative">
                  <Input
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={handleFieldChange}
                    placeholder="Confirm password"
                    className="h-11 rounded-xl border-slate-200 bg-white px-4 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {errors.confirmPassword && (

                  <p className="mt-1 text-xs text-red-600">

                    {errors.confirmPassword}

                  </p>

                )}

              </div>

            </div>



            <div className="space-y-5">

              <div>

                <label className="mb-2 block text-sm font-semibold text-slate-700">

                  Role

                </label>

                <select

                  name="role"

                  value={form.role}

                  onChange={handleFieldChange}

                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"

                >

                  <option value="admin">Admin</option>

                  <option value="encoder">Account Officer</option>

                </select>

              </div>



              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 xl:min-h-[230px]">

                <p className="text-sm font-semibold text-slate-800">

                  Account Notes

                </p>

                <p className="mt-2 text-sm leading-7 text-slate-600">

                  Use `enc_` for Account Officer accounts and `adm_` for admin

                  accounts. Each email should belong to one account; admins can

                  switch between Admin and Account Officer views after login.

                </p>

              </div>

            </div>

          </div>



          <div className="mt-8 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">

            <Button variant="outline" onClick={handleCancel} className="rounded-lg">

              Cancel

            </Button>

            <Button

              type="button"

              onClick={handleSave}
              disabled={isSaving}

              className="rounded-lg border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] px-5 text-white hover:from-[#19265f] hover:to-[#213a80]"

            >

              {isSaving ? "Saving..." : "Save"}

            </Button>

          </div>

        </CardContent>

      </Card>

    </div>

  );

}



function updateUsernamePrefix(username, role) {

  const normalized = String(username || "").trim().toLowerCase();

  const nextPrefix = role === "admin" ? "adm_" : "enc_";



  if (!normalized) {

    return nextPrefix;

  }



  if (normalized.startsWith("enc_") || normalized.startsWith("adm_")) {

    return `${nextPrefix}${normalized.split("_").slice(1).join("_")}`;

  }



  return `${nextPrefix}${normalized.replace(/[^a-z0-9_]/g, "")}`;

}
