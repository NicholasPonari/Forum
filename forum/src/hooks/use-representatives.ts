
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabaseClient";
import { UserDistrictInfo } from "@/lib/types/geo";
import { Politician } from "@/lib/types/db";

interface DistrictInfo {
  federal: {
    name: string | null;
    politician: Politician | null;
  };
  provincial: {
    name: string | null;
    politician: Politician | null;
  };
  municipalCity: {
    name: string | null;
    politician: Politician | null;
  };
  vancouverCouncil: {
    councillors: Politician[];
  };
  municipalDistrict: {
    name: string | null;
    politician: Politician | null;
  };
  municipalBorough: {
    name: string | null;
    politician: Politician | null;
  };
}

export function useRepresentatives(userDistricts: UserDistrictInfo | null) {
  const { user, profile } = useAuth();
  const [districtInfo, setDistrictInfo] = useState<DistrictInfo>({
    federal: { name: null, politician: null },
    provincial: { name: null, politician: null },
    municipalCity: { name: null, politician: null },
    vancouverCouncil: { councillors: [] },
    municipalDistrict: { name: null, politician: null },
    municipalBorough: { name: null, politician: null },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDistrictsAndPoliticians() {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      if (!userDistricts) {
        if (!profile?.coord) {
          setLoading(false);
          return;
        }
        return; // Wait for props
      }

      setLoading(true);
      const supabase = createClient();

      const federalName = userDistricts.federal;
      const provincialName = userDistricts.provincial;
      const municipalName = userDistricts.municipal;
      const municipalBorough = userDistricts.municipalBorough;
      const municipalCity = userDistricts.city;

      let federalPolitician: Politician | null = null;
      let provincialPolitician: Politician | null = null;
      let districtCouncillor: Politician | null = null;
      let boroughMayor: Politician | null = null;
      let cityMayor: Politician | null = null;
      let vancouverCouncillors: Politician[] = [];

      const isVancouver = municipalCity?.toLowerCase() === "vancouver";

      // Federal MP
      if (federalName) {
        const { data } = await supabase
          .from("politicians")
          .select(
            "id, name, district, organization, primary_role_en, party, email, photo_url, salary"
          )
          .ilike("organization", "%House of Commons%")
          .ilike("district", federalName)
          .limit(1);
        federalPolitician = data?.[0] || null;
      }

      // Provincial MNA/MPP
      if (provincialName) {
        // Try Quebec first
        let { data } = await supabase
          .from("politicians")
          .select(
            "id, name, district, organization, primary_role_en, party, email, photo_url, salary"
          )
          .ilike("organization", "%Assemblée nationale%")
          .ilike("district", provincialName.replace(/-/g, "%"))
          .limit(1);
        provincialPolitician = data?.[0] || null;

        // If not found, try Ontario
        if (!provincialPolitician) {
          const ontarioResult = await supabase
            .from("politicians")
            .select(
              "id, name, district, organization, primary_role_en, party, email, photo_url"
            )
            .ilike("organization", "%Legislative Assembly of Ontario%")
            .ilike("district", provincialName.replace(/-/g, "%"))
            .limit(1);
          provincialPolitician = ontarioResult.data?.[0] || null;
        }
      }

      // City Councillor
      if (municipalName && !isVancouver) {
        const { data } = await supabase
          .from("politicians")
          .select(
            "id, name, district, organization, primary_role_en, party, email, photo_url, salary"
          )
          .ilike("primary_role_en", "%councillor%")
          .ilike("district", municipalName)
          .limit(1);
        districtCouncillor = data?.[0] || null;
      }

      // Borough Mayor or City Mayor
      if (municipalBorough) {
        // Try borough mayor first
        let { data } = await supabase
          .from("politicians")
          .select(
            "id, name, district, organization, primary_role_en, party, email, photo_url, salary"
          )
          .ilike("primary_role_en", "%borough mayor%")
          .ilike("district", municipalBorough.replace(/-/g, "%"))
          .limit(1);
        boroughMayor = data?.[0] || null;

        // If not found, try city mayor
        if (!boroughMayor) {
          const mayorResult = await supabase
            .from("politicians")
            .select(
              "id, name, district, organization, primary_role_en, party, email, photo_url"
            )
            .ilike("primary_role_en", "%Mayor%")
            .not("primary_role_en", "ilike", "%borough%")
            .ilike("district", municipalBorough.replace(/-/g, "%"))
            .limit(1);
          boroughMayor = mayorResult.data?.[0] || null;
        }
      }

      // City Mayor (Montreal special case)
      if (municipalCity && municipalCity.toLowerCase() === "montreal") {
        const { data } = await supabase
          .from("politicians")
          .select(
            "id, name, district, organization, primary_role_en, party, email, photo_url, salary"
          )
          .ilike("organization", "%Conseil municipal de%")
          .ilike("primary_role_en", "%Mayor%")
          .not("primary_role_en", "ilike", "%borough%")
          .or(
            "primary_role_en.ilike.%Montréal%,primary_role_en.ilike.%Montreal%"
          )
          .limit(1);
        cityMayor = data?.[0] || null;
      }

      // Vancouver: at-large council
      if (municipalCity && municipalCity.toLowerCase() === "vancouver") {
        const { data: mayorData } = await supabase
          .from("politicians")
          .select(
            "id, name, district, organization, primary_role_en, party, email, photo_url, salary"
          )
          .ilike("organization", "%Vancouver City Council%")
          .ilike("primary_role_en", "%Mayor%")
          .eq("district", "Vancouver")
          .limit(1);
        cityMayor = mayorData?.[0] || null;

        const { data: councillorData } = await supabase
          .from("politicians")
          .select(
            "id, name, district, organization, primary_role_en, party, email, photo_url, salary"
          )
          .ilike("organization", "%Vancouver City Council%")
          .ilike("primary_role_en", "%Councillor%")
          .eq("district", "Vancouver")
          .order("name", { ascending: true });
        vancouverCouncillors = councillorData || [];
      }

      setDistrictInfo({
        federal: { name: federalName, politician: federalPolitician },
        provincial: { name: provincialName, politician: provincialPolitician },
        municipalCity: { name: municipalCity, politician: cityMayor },
        vancouverCouncil: { councillors: vancouverCouncillors },
        municipalDistrict: {
          name: municipalName,
          politician: districtCouncillor,
        },
        municipalBorough: { name: municipalBorough, politician: boroughMayor },
      });
      setLoading(false);
    }

    fetchDistrictsAndPoliticians();
  }, [userDistricts, user?.id, profile?.coord]);

  return { districtInfo, loading, user };
}
