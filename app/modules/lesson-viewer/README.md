# lesson-viewer

The queries and rules behind the Student's Lesson page
(`app/routes/courses.$slug.lessons.$lessonId.tsx`): the course and its
curriculum, lesson progress and watch position, the Questions & Discussion
thread, and quiz grading. Moved out of the route as they were; only the quiz
lookups and marking a lesson complete have tests so far.

Entry points: `course.server.ts`, `progress.server.ts`, `thread.server.ts`,
`quiz.server.ts`.
