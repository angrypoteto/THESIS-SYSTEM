/**
 * Undergraduate programs of Rizal Technological University, from the official "Course Offerings" page
 * https://www.rtu.edu.ph/college/ (read 2026-11-09). Grouped by college as RTU lists them; campus notes kept.
 * Two typos on the page ("Bachelor or Technical-Vocational ...") are corrected to "Bachelor of".
 * Update this list when RTU changes its offerings; the profile stores the program name as text.
 */
export const RTU_PROGRAMS: { college: string; programs: string[] }[] = [
  {
    college: 'College of Engineering and Architecture',
    programs: [
      'Bachelor of Science in Mechanical Engineering',
      'Bachelor of Science in Civil Engineering',
      'Bachelor of Science in Electrical Engineering',
      'Bachelor of Science in Electronics Engineering',
      'Bachelor of Science in Computer Engineering',
      'Bachelor of Science in Industrial Engineering (Boni Campus)',
      'Bachelor of Science in Instrumentation and Control Engineering (Boni Campus)',
      'Bachelor of Science in Mechatronics',
    ],
  },
  { college: 'Institute of Architecture', programs: ['Bachelor of Science in Architecture'] },
  { college: 'Institute of Computer Studies', programs: ['Bachelor of Science in Information Technology (Pasig Campus)'] },
  {
    college: 'College of Business, Entrepreneurship and Accountancy',
    programs: [
      'Bachelor of Science in Accountancy',
      'Bachelor of Science in Entrepreneurship',
      'Bachelor of Science in Office Administration',
      'Bachelor of Science in Business Administration major in Operations Management',
      'Bachelor of Science in Business Administration major in Marketing Management',
      'Bachelor of Science in Business Administration major in Financial Management',
      'Bachelor of Science in Business Administration major in Human Resource Management',
    ],
  },
  {
    college: 'College of Education',
    programs: [
      'Bachelor of Secondary Education major in English',
      'Bachelor of Secondary Education major in Math',
      'Bachelor of Secondary Education major in Science (Boni Campus)',
      'Bachelor of Secondary Education major in Social Studies',
      'Bachelor of Secondary Education major in Filipino',
      'Bachelor of Technical-Vocational Teacher Education major in Animation',
      'Bachelor of Technical-Vocational Teacher Education major in Computer Hardware Servicing',
      'Bachelor of Technical-Vocational Teacher Education major in Visual Graphic Design',
      'Bachelor of Technical-Vocational Teacher Education major in Garments Fashion and Design',
      'Bachelor of Technical-Vocational Teacher Education major in Electronics Technology',
      'Bachelor of Technical-Vocational Teacher Education major in Welding and Fabrications Technology',
    ],
  },
  {
    college: 'College of Arts and Sciences',
    programs: [
      'Bachelor of Science in Psychology',
      'Bachelor of Arts in Political Science',
      'Bachelor of Science in Statistics (Boni Campus)',
      'Bachelor of Science in Biology (Boni Campus)',
      'Bachelor of Science in Astronomy',
    ],
  },
  { college: 'Institute of Human Kinetics', programs: ['Bachelor of Science in Physical Education (Boni Campus)'] },
]

export const ALL_RTU_PROGRAMS = RTU_PROGRAMS.flatMap((g) => g.programs)
