-- CREATE_PROGRAMS: create new programs only. No edit/archive, and never the
-- reviewer-VM toggle - that stays exclusive to MANAGE_PROGRAMS (which implies
-- this permission).
ALTER TYPE "OrgPermission" ADD VALUE 'CREATE_PROGRAMS';
