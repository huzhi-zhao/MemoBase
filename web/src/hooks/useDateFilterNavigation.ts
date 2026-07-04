import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { parseFilterQuery, stringifyFilters } from "@/contexts/MemoFilterContext";

export const useDateFilterNavigation = (targetPath?: string) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const navigateToDateFilter = useCallback(
    (date: string) => {
      const existingFilters = parseFilterQuery(searchParams.get("filter")).filter((f) => f.factor !== "displayTime");
      const filterQuery = stringifyFilters([...existingFilters, { factor: "displayTime", value: date }]);
      const basePath = targetPath ?? location.pathname;
      const newParams = new URLSearchParams(searchParams);
      newParams.set("filter", filterQuery);
      navigate(`${basePath}?${newParams.toString()}`);
    },
    [navigate, location.pathname, targetPath, searchParams],
  );

  return navigateToDateFilter;
};
