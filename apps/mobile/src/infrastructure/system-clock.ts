// The one place the device wall clock is read for a stored or sent timestamp. A repository,
// loader or task takes it as a dependency (`now`), so a test hands in a fixed clock instead.

export const systemDate = (): Date => new Date();

/** The instant as the canonical UTC form every stored client clock uses. */
export const systemNow = (): string => systemDate().toISOString();
